# KindlyClick

Milestone 1 foundation for the KindlyClick Live Agent project.

## Structure

- `backend/`: Node.js backend skeleton with WebSocket handling and Firestore-backed session manager.
- `terraform/`: Infrastructure-as-code for APIs, Firestore Native DB, and Cloud Run placeholder service.
- `extension/`: Manifest-only Chrome extension shell.
- `tests/harness.js`: WebSocket harness that validates `session_start` persistence.

## Local run

1. Install backend dependencies:

```bash
cd backend
npm install
```

2. Start the backend:

```bash
npm start
```

3. In another shell, run the harness:

```bash
cd tests
node harness.js
```

## Terraform usage

```bash
cd terraform
terraform init
terraform plan -var="project_id=YOUR_PROJECT_ID"
```

Do not run `terraform apply` until project-level settings and billing are confirmed.
