locals {
  required_services = [
    "run.googleapis.com",
    "firestore.googleapis.com",
    "aiplatform.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com"
  ]

  gemini_live_fallback_models_csv = join(",", var.gemini_live_fallback_models)
}

resource "google_project_service" "required" {
  for_each = toset(local.required_services)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_firestore_database" "default" {
  project                     = var.project_id
  name                        = var.firestore_database_id
  location_id                 = var.firestore_location
  type                        = "FIRESTORE_NATIVE"
  delete_protection_state     = "DELETE_PROTECTION_ENABLED"
  deletion_policy             = "ABANDON"
  app_engine_integration_mode = "DISABLED"

  depends_on = [google_project_service.required]
}

resource "google_artifact_registry_repository" "backend" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_registry_repository_id
  description   = "KindlyClick backend images"
  format        = "DOCKER"

  depends_on = [google_project_service.required]
}

resource "google_service_account" "backend" {
  project      = var.project_id
  account_id   = var.service_account_id
  display_name = "KindlyClick backend runtime"
}

resource "google_project_iam_member" "backend_firestore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_project_iam_member" "backend_aiplatform_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

data "google_project" "current" {
  project_id = var.project_id
}

resource "google_project_iam_member" "cloudbuild_artifact_registry_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${data.google_project.current.number}@cloudbuild.gserviceaccount.com"

  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_service" "backend" {
  count    = var.deploy_cloud_run_service ? 1 : 0
  project  = var.project_id
  name     = var.service_name
  location = var.region

  template {
    service_account                  = google_service_account.backend.email
    timeout                          = "${var.cloud_run_timeout_seconds}s"
    max_instance_request_concurrency = var.cloud_run_concurrency

    scaling {
      min_instance_count = var.cloud_run_min_instances
      max_instance_count = var.cloud_run_max_instances
    }

    containers {
      image = var.container_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = var.cloud_run_cpu
          memory = var.cloud_run_memory
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "HOST"
        value = "0.0.0.0"
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }

      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = var.region
      }

      env {
        name  = "FIRESTORE_DATABASE_ID"
        value = var.firestore_database_id
      }

      env {
        name  = "ENABLE_REAL_GEMINI_LIVE"
        value = tostring(var.enable_real_gemini_live)
      }

      env {
        name  = "GEMINI_USE_VERTEXAI"
        value = tostring(var.gemini_use_vertexai)
      }

      env {
        name  = "ACCEPT_CLIENT_LOGS"
        value = tostring(var.accept_client_logs)
      }

      env {
        name  = "GEMINI_LIVE_MODEL"
        value = var.gemini_live_model
      }

      env {
        name  = "GEMINI_LIVE_FALLBACK_MODELS"
        value = local.gemini_live_fallback_models_csv
      }

      startup_probe {
        initial_delay_seconds = 0
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 12

        http_get {
          path = "/health"
          port = 8080
        }
      }
    }
  }

  ingress = "INGRESS_TRAFFIC_ALL"

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  depends_on = [
    google_project_service.required,
    google_artifact_registry_repository.backend,
    google_project_iam_member.backend_firestore_user,
    google_project_iam_member.backend_aiplatform_user
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  count    = var.deploy_cloud_run_service ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.backend[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
