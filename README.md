# KindlyClick

Milestone 3 foundation for the KindlyClick Live Agent project.

## Structure

- `backend/`: Node.js backend with WebSocket session management, audio streaming, vision frame ingestion, and barge-in signaling.
- `terraform/`: Infrastructure-as-code for APIs, Firestore Native DB, and Cloud Run placeholder service.
- `extension/`: Chrome extension side panel with 16kHz mono microphone capture, 1 FPS screen vision capture, and response playback.
- `extension/src/audioController.js`: Reusable audio/session state machine used by both UI and harness tests.
- `extension/background.js` + `extension/content.js`: Active-tab context helpers (title/url + lightweight heading/button hints) attached to vision frame metadata.
- `tests/harness.js`: WebSocket harness that validates vision simulation plus interruption (barge-in) behavior.
- `tests/extension_harness.js`: End-to-end extension-loop harness using scripted mic input, full controller logic, and timeline artifacts.

## Local run

1. Install backend dependencies:

```bash
cd backend
npm install
```

2. Start the backend (use any free local port):

```bash
PORT=8091 npm start
```

3. In another shell, run backend protocol harness (vision + audio):

```bash
HARNESS_PORT=8092 node tests/harness.js
```

4. Run extension-loop harness (no manual browser interaction):

```bash
EXT_HARNESS_PORT=8093 node tests/extension_harness.js
```

This generates `tests/artifacts/extension_timeline.json` with ordered in/out WS events and controller logs.

5. To test the extension manually:

```bash
# Load extension/ as an unpacked extension in Chrome.
# Open the KindlyClick side panel and set the URL, e.g.:
ws://127.0.0.1:8091/ws
```

6. Side panel interaction flow:

```bash
Connect -> Request Mic -> Start Mic
Connect -> Start Vision (share current tab/window when prompted)
```

Use `End Turn` to deterministically trigger an audio response while keeping mic active for barge-in.
Use `Ask: What do you see?` to request a vision summary from the latest screen frames.

## Terraform usage

```bash
cd terraform
terraform init
terraform plan -var="project_id=YOUR_PROJECT_ID"
```

Do not run `terraform apply` until project-level settings and billing are confirmed.
