# KindlyClick

Milestone 3.5 foundation for the KindlyClick Live Agent project.

## Structure

- `backend/`: Node.js backend with WebSocket session management, audio streaming, vision frame ingestion, barge-in signaling, and optional real Gemini Live wiring.
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

2. Start the backend in mock mode (use any free local port):

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
Connect -> Start Mic
Connect -> Start Vision (share current tab/window when prompted)
```

If side panel mic permission is dismissed, the extension opens a helper tab
(`request-mic.html`) so the user can grant microphone access there; the side panel then retries `Start Mic` automatically.

Use `End Turn` to deterministically trigger an audio response while keeping mic active for barge-in.
Use `Ask: What do you see?` to request a vision summary from the latest screen frames.

## Real Gemini Live mode (Milestone 3.5)

The backend defaults to deterministic mock mode.

To run against Gemini Live on Vertex AI:

```bash
export ENABLE_REAL_GEMINI_LIVE=true
export GOOGLE_CLOUD_PROJECT="$GCP_PROJECT_ID"
export GOOGLE_CLOUD_LOCATION="us-central1"
# Current Vertex Live default:
export GEMINI_LIVE_MODEL="gemini-live-2.5-flash-native-audio"
# Optional fallback chain (comma-separated):
export GEMINI_LIVE_FALLBACK_MODELS="gemini-live-2.5-flash-preview-native-audio-09-2025,gemini-2.0-flash-live-preview-04-09"
```

Then start the backend:

```bash
HOST=0.0.0.0 PORT=8091 npm --prefix backend start
```

If needed, you can override SDK settings:

```bash
export GEMINI_API_VERSION="v1"
# Optional: set false to use API key mode instead of Vertex AI.
export GEMINI_USE_VERTEXAI=true
```

## Terraform usage

```bash
cd terraform
terraform init
terraform plan -var="project_id=YOUR_PROJECT_ID"
```

Do not run `terraform apply` until project-level settings and billing are confirmed.
