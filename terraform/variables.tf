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

variable "artifact_registry_repository_id" {
  description = "Artifact Registry repository ID for backend images"
  type        = string
  default     = "kindlyclick"
}

variable "service_account_id" {
  description = "Service account ID used by the Cloud Run backend"
  type        = string
  default     = "kindlyclick-backend"
}

variable "container_image" {
  description = "Full container image URI deployed to Cloud Run"
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = !var.deploy_cloud_run_service || (var.container_image != null && trimspace(var.container_image) != "")
    error_message = "container_image must be set when deploy_cloud_run_service=true."
  }
}

variable "deploy_cloud_run_service" {
  description = "Whether Terraform should manage the Cloud Run service"
  type        = bool
  default     = false
}

variable "firestore_database_id" {
  description = "Firestore database ID used by the backend"
  type        = string
  default     = "(default)"
}

variable "cloud_run_cpu" {
  description = "CPU limit for the Cloud Run container"
  type        = string
  default     = "1"
}

variable "cloud_run_memory" {
  description = "Memory limit for the Cloud Run container"
  type        = string
  default     = "1Gi"
}

variable "cloud_run_timeout_seconds" {
  description = "Request timeout for Cloud Run websocket sessions"
  type        = number
  default     = 3600
}

variable "cloud_run_concurrency" {
  description = "Maximum concurrent requests per Cloud Run instance"
  type        = number
  default     = 20
}

variable "cloud_run_min_instances" {
  description = "Minimum number of Cloud Run instances to keep warm"
  type        = number
  default     = 1
}

variable "cloud_run_max_instances" {
  description = "Maximum number of Cloud Run instances"
  type        = number
  default     = 10
}

variable "enable_real_gemini_live" {
  description = "Enable Gemini Live on Vertex AI in production"
  type        = bool
  default     = true
}

variable "gemini_use_vertexai" {
  description = "Use Vertex AI instead of API key mode"
  type        = bool
  default     = true
}

variable "accept_client_logs" {
  description = "Allow extension clients to relay structured logs to the backend"
  type        = bool
  default     = true
}

variable "gemini_live_model" {
  description = "Primary Gemini Live model"
  type        = string
  default     = "gemini-live-2.5-flash-native-audio"
}

variable "gemini_live_fallback_models" {
  description = "Fallback Gemini Live models"
  type        = list(string)
  default = [
    "gemini-live-2.5-flash-preview-native-audio-09-2025",
    "gemini-2.0-flash-live-preview-04-09"
  ]
}
