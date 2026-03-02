variable "project_id" {
  description = "Google Cloud project ID"
  type        = string
}

variable "region" {
  description = "Primary deployment region"
  type        = string
  default     = "us-central1"
}

variable "firestore_location" {
  description = "Firestore database location (multi-region recommended, e.g. nam5)"
  type        = string
  default     = "nam5"
}

variable "service_name" {
  description = "Cloud Run service name"
  type        = string
  default     = "kindlyclick-backend"
}
