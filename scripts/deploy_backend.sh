#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TERRAFORM_DIR="${ROOT_DIR}/terraform"

require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 1
  fi
}

require_command gcloud
require_command terraform

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env"
  set +a
fi

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-${GCP_PROJECT_ID:-}}"
REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
FIRESTORE_LOCATION="${FIRESTORE_LOCATION:-nam5}"
SERVICE_NAME="${SERVICE_NAME:-kindlyclick-backend}"
ARTIFACT_REPOSITORY_ID="${ARTIFACT_REGISTRY_REPOSITORY_ID:-kindlyclick}"
IMAGE_NAME="${IMAGE_NAME:-backend}"
IMAGE_TAG="${IMAGE_TAG:-$(git -C "${ROOT_DIR}" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY_ID}/${IMAGE_NAME}:${IMAGE_TAG}"
ENABLE_REAL_GEMINI_LIVE="${ENABLE_REAL_GEMINI_LIVE:-true}"
GEMINI_USE_VERTEXAI="${GEMINI_USE_VERTEXAI:-true}"
ACCEPT_CLIENT_LOGS="${ACCEPT_CLIENT_LOGS:-true}"
GEMINI_LIVE_MODEL="${GEMINI_LIVE_MODEL:-gemini-live-2.5-flash-native-audio}"
GEMINI_LIVE_FALLBACK_MODELS="${GEMINI_LIVE_FALLBACK_MODELS:-gemini-live-2.5-flash-preview-native-audio-09-2025,gemini-2.0-flash-live-preview-04-09}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "Set GCP_PROJECT_ID in .env or export GOOGLE_CLOUD_PROJECT before deploying." >&2
  exit 1
fi

IFS=',' read -r -a fallback_models_raw <<< "${GEMINI_LIVE_FALLBACK_MODELS}"
fallback_models_tf="["
for model in "${fallback_models_raw[@]}"; do
  trimmed_model="$(echo "${model}" | xargs)"
  if [[ -z "${trimmed_model}" ]]; then
    continue
  fi

  if [[ "${fallback_models_tf}" != "[" ]]; then
    fallback_models_tf+=", "
  fi
  fallback_models_tf+="\"${trimmed_model}\""
done
fallback_models_tf+="]"

echo "Bootstrapping APIs, Firestore, Artifact Registry, and IAM..."
terraform -chdir="${TERRAFORM_DIR}" init
terraform -chdir="${TERRAFORM_DIR}" apply -auto-approve \
  -target=google_project_service.required \
  -target=google_firestore_database.default \
  -target=google_artifact_registry_repository.backend \
  -target=google_service_account.backend \
  -target=google_project_iam_member.backend_firestore_user \
  -target=google_project_iam_member.backend_aiplatform_user \
  -target=google_project_iam_member.cloudbuild_artifact_registry_writer \
  -target=google_cloud_run_v2_service.backend \
  -var="project_id=${PROJECT_ID}" \
  -var="region=${REGION}" \
  -var="firestore_location=${FIRESTORE_LOCATION}" \
  -var="service_name=${SERVICE_NAME}" \
  -var="artifact_registry_repository_id=${ARTIFACT_REPOSITORY_ID}" \
  -var="deploy_cloud_run_service=false"

echo "Building and pushing ${IMAGE_URI} via Cloud Build..."
gcloud builds submit "${ROOT_DIR}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --tag="${IMAGE_URI}"

echo "Deploying Cloud Run service ${SERVICE_NAME}..."
terraform -chdir="${TERRAFORM_DIR}" apply -auto-approve \
  -var="project_id=${PROJECT_ID}" \
  -var="region=${REGION}" \
  -var="firestore_location=${FIRESTORE_LOCATION}" \
  -var="service_name=${SERVICE_NAME}" \
  -var="artifact_registry_repository_id=${ARTIFACT_REPOSITORY_ID}" \
  -var="deploy_cloud_run_service=true" \
  -var="container_image=${IMAGE_URI}" \
  -var="enable_real_gemini_live=${ENABLE_REAL_GEMINI_LIVE}" \
  -var="gemini_use_vertexai=${GEMINI_USE_VERTEXAI}" \
  -var="accept_client_logs=${ACCEPT_CLIENT_LOGS}" \
  -var="gemini_live_model=${GEMINI_LIVE_MODEL}" \
  -var="gemini_live_fallback_models=${fallback_models_tf}"

SERVICE_URL="$(terraform -chdir="${TERRAFORM_DIR}" output -raw cloud_run_uri)"
WEBSOCKET_URL="${SERVICE_URL/https:\/\//wss://}/ws"

echo "Backend URL: ${SERVICE_URL}"
echo "WebSocket URL: ${WEBSOCKET_URL}"
