# Commands

Use these commands selectively. Do not load this file unless you need exact command patterns.

## Confirm Active Context

```bash
gcloud config get-value core/account
gcloud config get-value core/project
```

## Check API Enablement

```bash
gcloud services list --enabled \
  --filter='NAME:cloudbuild.googleapis.com OR NAME:artifactregistry.googleapis.com OR NAME:run.googleapis.com' \
  --format='value(NAME)' \
  --project=YOUR_PROJECT_ID
```

## Inspect Caller IAM

```bash
gcloud projects get-iam-policy YOUR_PROJECT_ID \
  --flatten='bindings[].members' \
  --filter='bindings.members:user:YOU@example.com' \
  --format='table(bindings.role)'
```

## Check Cloud Build Role Contents

```bash
gcloud iam roles describe roles/cloudbuild.builds.editor \
  --format='yaml(includedPermissions)'
```

## Retry Cloud Build Regionally

Prefer the regional endpoint when Cloud Run and Artifact Registry are regional, especially after a 403 from the default global endpoint.

```bash
gcloud builds submit REPO_ROOT \
  --project=YOUR_PROJECT_ID \
  --region=us-central1 \
  --tag=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/REPOSITORY/IMAGE:TAG
```

## Inspect Upload Set

```bash
gcloud meta list-files-for-upload
```

Use this after editing `.gcloudignore` to confirm that only Dockerfile inputs are uploaded.

## Check Build Failure Log

gcloud prints the local log path on failure, typically under:

```text
~/.config/gcloud/logs/YYYY.MM.DD/...
```

Inspect that file to answer:

- which principal made the request
- which endpoint was used
- whether the request hit `locations/global` or a regional location
- whether the failure happened on build creation or later in the build

## Verify Cloud Run Health

```bash
curl -fsS https://YOUR_CLOUD_RUN_HOST/health
```

## WebSocket URL Pattern

Convert the service URL to WebSocket form like this:

```text
https://SERVICE_HOST  ->  wss://SERVICE_HOST/ws
```
