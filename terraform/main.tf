locals {
  required_services = [
    "run.googleapis.com",
    "firestore.googleapis.com",
    "aiplatform.googleapis.com",
    "artifactregistry.googleapis.com"
  ]
}

resource "google_project_service" "required" {
  for_each = toset(local.required_services)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_firestore_database" "default" {
  project                     = var.project_id
  name                        = "(default)"
  location_id                 = var.firestore_location
  type                        = "FIRESTORE_NATIVE"
  delete_protection_state     = "DELETE_PROTECTION_ENABLED"
  deletion_policy             = "ABANDON"
  app_engine_integration_mode = "DISABLED"

  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_service" "backend" {
  project  = var.project_id
  name     = var.service_name
  location = var.region

  template {
    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
    }
  }

  ingress = "INGRESS_TRAFFIC_ALL"

  depends_on = [google_project_service.required]
}
