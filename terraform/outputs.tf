output "artifact_registry_repository" {
  value       = google_artifact_registry_repository.backend.repository_id
  description = "Artifact Registry repository ID"
}

output "backend_service_account_email" {
  value       = google_service_account.backend.email
  description = "Cloud Run runtime service account email"
}

output "cloud_run_service_name" {
  value       = var.deploy_cloud_run_service ? google_cloud_run_v2_service.backend[0].name : null
  description = "Cloud Run backend service name"
}

output "cloud_run_uri" {
  value       = var.deploy_cloud_run_service ? google_cloud_run_v2_service.backend[0].uri : null
  description = "Cloud Run backend service URL"
}

output "firestore_database_name" {
  value       = google_firestore_database.default.name
  description = "Firestore database name"
}
