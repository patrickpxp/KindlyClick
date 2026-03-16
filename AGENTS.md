# AGENTS.md

## Real Gemini Live backend

The canonical setup notes live in [README.md](/home/pat/kindlyclick/README.md), under `Real Gemini Live mode (Milestone 3.5)`.

For this repo, the verified local startup flow is:

```bash
cd /home/pat/kindlyclick
set -a
source .env
set +a

export ENABLE_REAL_GEMINI_LIVE=true
export GOOGLE_CLOUD_PROJECT="$GCP_PROJECT_ID"
export GOOGLE_CLOUD_LOCATION="us-central1"
export GEMINI_LIVE_MODEL="gemini-live-2.5-flash-native-audio"
export GEMINI_LIVE_FALLBACK_MODELS="gemini-live-2.5-flash-preview-native-audio-09-2025,gemini-2.0-flash-live-preview-04-09"
export GEMINI_USE_VERTEXAI=true
export ACCEPT_CLIENT_LOGS=true

HOST=0.0.0.0 PORT=8091 npm --prefix backend start
```

Notes:

- `.env` currently provides `GCP_PROJECT_ID`, so source it before launching.
- The side panel default WebSocket URL is `ws://127.0.0.1:8091/ws`.
- Real Gemini Live is only used when `ENABLE_REAL_GEMINI_LIVE=true`; otherwise the backend falls back to mock mode.
- A successful live startup will log `Configured Gemini Live Runner` and then `Gemini Live connected ...`.
