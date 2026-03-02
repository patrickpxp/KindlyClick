output "cloud_run_service_name" {
  value       = google_cloud_run_v2_service.backend.name
  description = "Cloud Run backend service name"
}

output "cloud_run_uri" {
  value       = google_cloud_run_v2_service.backend.uri
  description = "Cloud Run backend service URL"
}

output "firestore_database_name" {
  value       = google_firestore_database.default.name
  description = "Firestore database name"
}
