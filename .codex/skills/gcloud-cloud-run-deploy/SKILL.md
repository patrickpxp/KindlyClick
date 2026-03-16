---
name: gcloud-cloud-run-deploy
description: Deploy and debug Google Cloud backend services with gcloud, Cloud Build, Artifact Registry, and Cloud Run. Use when Codex needs to roll out a containerized service, inspect build or deploy failures, verify active gcloud account/project/API state, diagnose Cloud Build permission errors, handle regional-vs-global build endpoint issues, or confirm Cloud Run health after deployment.
---

# Gcloud Cloud Run Deploy

## Overview

Use this skill for GCP backend rollouts that depend on `gcloud`, Cloud Build, Artifact Registry, and Cloud Run.
Prefer it when the task includes deployment, failed `gcloud builds submit`, IAM ambiguity, or post-deploy verification.

Read [references/commands.md](references/commands.md) when you need exact command patterns.

## Workflow

1. Confirm the active target before changing anything.
   Run `gcloud config get-value core/account` and `gcloud config get-value core/project`.
   If the task is project-specific, verify the expected project explicitly.

2. Check service enablement before debugging permissions.
   Verify the APIs relevant to the task, especially `cloudbuild.googleapis.com`, `artifactregistry.googleapis.com`, and `run.googleapis.com`.

3. Distinguish caller permissions from service-account permissions.
   For `gcloud builds submit`, the caller needs permission to create the build.
   The Cloud Build service account then needs permission to push to Artifact Registry.
   Validate both paths separately.

4. Prefer regional Cloud Build when the deployment is regional.
   If `gcloud builds submit` fails with `PERMISSION_DENIED` on the default `locations/global` endpoint, retry with `--region=<artifact-registry-or-run-region>`.
   Treat this as a real troubleshooting branch, not a theoretical fallback. It was the decisive fix in this repo's deployment.

5. Inspect the exact failing request before changing IAM blindly.
   Read the gcloud log path printed by the failed command.
   Look for the API host, location, principal, and HTTP status.
   If the failing request is `cloudbuild.googleapis.com/.../locations/global/builds` and a regional retry succeeds, fix the workflow to use the regional endpoint instead of expanding IAM.

6. Minimize Cloud Build upload context when using `gcloud builds submit`.
   Prefer a repo-level `.gcloudignore`.
   Validate with `gcloud meta list-files-for-upload`.
   Keep only the files that the Dockerfile copies.

7. After a successful image push, deploy Cloud Run and verify externally.
   Confirm the service URL, derive the WebSocket URL if applicable, and hit `/health` or the service's readiness endpoint.

## Debugging Rules

- Do not assume `roles/owner` rules out endpoint-specific failures.
- Do not assume a Cloud Build 403 means the API is disabled; verify both API status and request location.
- Do not switch to local Docker if the task explicitly excludes it.
- When Terraform and gcloud are combined, separate infra bootstrap from image build/push and from final service rollout. This narrows the failure surface.
- If Terraform state contains an older placeholder service, account for state reconciliation before treating destroy/recreate behavior as unexpected.

## Outputs

When completing a deployment task, return:

- the final Cloud Run URL
- the WebSocket URL if relevant
- the pushed image URI or tag
- the command or config change that fixed the failure, if any
- the verification result from the deployed service
