# KindlyClick Technical Overview

Updated from the repository state on March 11, 2026.

## Purpose of this document

This file is a technical briefing for someone who needs to get up to speed quickly on KindlyClick before discussing future features. It describes the app as it exists in the codebase today, not just the original concept.

## What KindlyClick is

KindlyClick is a Chrome-extension-based assistive agent for seniors and other low-confidence computer users. The product combines:

- live microphone input from the browser extension
- live screen sharing from the current browser tab or window
- a backend that streams those inputs into a Gemini Live session or a local mock session
- spoken responses streamed back into the extension for playback
- a simple tool loop that lets the model visually point at things on the page with a highlight overlay

The intended UX is "pair navigation by voice": the user asks for help in natural language, the agent sees the screen, responds with voice, and can point to UI elements.

## Current architecture

### 1. Chrome extension

The extension is a Manifest V3 Chrome extension built around a side panel UI.

Main pieces:

- `extension/sidepanel.html` + `extension/sidepanel.js`: primary control surface for connecting to the backend, starting/stopping microphone capture, starting/stopping vision capture, sending a "What do you see?" prompt, and toggling client log relay.
- `extension/src/audioController.js`: reusable state machine for WebSocket session lifecycle, audio input, playback, turn boundaries, and command dispatch.
- `extension/background.js`: background service worker used for active-tab lookup, content hint retrieval, opening the microphone permission helper page, and dispatching highlight commands into the page.
- `extension/content.js`: content script that gathers lightweight page hints and renders the on-page highlight overlay.
- `extension/request-mic.html`: helper page opened when the side panel cannot complete microphone permission flow directly.

The extension currently depends on the side panel as the runtime host. If the side panel is closed, the UI state, capture loops, and session controller go away.

### 2. Backend

The backend is a Node.js WebSocket service.

Main responsibilities:

- create and track sessions
- receive microphone PCM chunks and vision frames from the extension
- pass those inputs into either a mock live session or a real Gemini Live session adapter
- stream response audio back to the extension
- emit interruption signals for barge-in
- relay simple tool commands such as `DRAW_HIGHLIGHT`
- persist session metadata and executed tool calls in Firestore or a mock Firestore

Main pieces:

- `backend/src/server.js`: HTTP health/debug routes plus the WebSocket protocol handler
- `backend/src/adk/agent.js`: runner configuration, system prompt, tool declaration, and mock-vs-real session selection
- `backend/src/adk/mockLiveSession.js`: deterministic local behavior used for development and harness tests
- `backend/src/adk/geminiLiveSession.js`: real Gemini Live adapter
- `backend/src/sessions/sessionManager.js`: session start lookup plus append-only tool-call persistence
- `backend/src/firestore/client.js`: real Firestore client or in-memory mock
- `backend/src/config/env.js`: runtime configuration flags and defaults

### 3. Infrastructure and tests

Infrastructure is planned around Cloud Run plus Firestore, managed with Terraform.

Testing is a meaningful part of the project, not an afterthought:

- `tests/harness.js`: backend protocol harness for audio, vision, tool loopback, and interruption behavior
- `tests/extension_harness.js`: end-to-end harness that drives the shared extension audio controller without needing manual browser interaction

This means the repo already has a decent foundation for validating transport-level behavior before discussing broader product changes.

## Current runtime flow

### Session start

1. The side panel opens a WebSocket connection to the backend.
2. The extension sends `session_start` with a generated session ID and basic metadata.
3. The backend creates or updates a session record and returns `session_started`.

### Audio input

1. The side panel captures microphone audio with Web Audio.
2. Audio is resampled to 16 kHz mono PCM16.
3. Chunks are base64 encoded and sent as `audio_input`.
4. When the user presses End Turn, the extension sends `audio_input_end`.

The controller also uses a lightweight client-side RMS threshold to avoid starting an utterance on very quiet input, but main interruption handling is backend/live-session driven.

### Vision input

1. The side panel starts screen sharing with `getDisplayMedia`.
2. Frames are sampled at 1 FPS.
3. Each frame is converted to a 1280x720 JPEG and sent as `realtime_input` with `modality: "vision"`.
4. The extension also sends page metadata gathered from the active tab.

Current metadata attached to vision frames is intentionally lightweight:

- page title
- page URL
- tab ID
- a small list of heading texts
- a small list of button texts

This is not full DOM capture, not accessibility-tree capture, and not event-stream capture.

### Backend response loop

Depending on configuration, the backend uses either:

- a deterministic mock session for local development, or
- a real Gemini Live session through the Google GenAI SDK

The backend sends events back to the extension including:

- `audio_output`
- `audio_output_end`
- `clear_buffer`
- `vad_event`
- `text_output`
- `command`
- `vision_input_ack`
- `vision_status_ack`

### Tool execution

The only implemented model tool today is highlight drawing.

Flow:

1. The model emits a highlight command.
2. The backend forwards it as a generic `command`.
3. The extension routes it through the background worker.
4. The content script draws a pulsing ring and optional label on the current page.

The highlight system already supports normalized coordinates and optional labels. It does not currently expose user-facing customization of color, size, or style.

## What is implemented versus what is still thin

### Implemented in a real way

- extension-to-backend WebSocket protocol
- microphone streaming and streamed playback
- barge-in signaling path with `clear_buffer`
- vision capture loop at low frame rate
- active-tab metadata enrichment
- on-page highlight rendering
- test harnesses for backend protocol and extension controller behavior
- minimal Firestore-backed session/tool-call persistence
- environment-based switch between mock mode and real Gemini Live mode

### Considered improvements and potential features on the roadmap we need to research before implementing.

1. does it help the Gemini Live agent to gather more context for our use case : I was thinking perhaps things like tab name, browser language , page meta ...  whatever useful and relevant information the browser extension could capture.
2. in the same spirit as above, browser interaction event streaming such as clicks, scrolls, navigation transitions, or focus changes
- robust disambiguation of background noise versus true user interruption
- long-lived extension runtime independent of the side panel
- richer persistence beyond session metadata and tool-call history
- product analytics, admin tooling, and production-grade observability
- user-testing evidence that the current interaction pattern is genuinely effective for seniors

## Important current constraints

### Side panel dependency

The side panel is the active runtime container. Today, closing it effectively stops the live experience. This is one of the most important architectural constraints for future planning.

### Narrow page understanding

The backend currently receives only:

- JPEG frames from screen sharing
- lightweight page hints from the content script

It does not receive the full HTML, full DOM, accessibility tree, continuous browser event feed, or full page semantics.

### Minimal memory and persistence

Session persistence is currently shallow. The backend stores:

- session metadata
- session state
- appended tool calls

It does not yet store deep conversational memory, user profiles, action traces, or detailed analytics.

### Mock-first development

The default local mode is deterministic mock mode. This is useful for development velocity and testing, but it means not every behavior in the repo reflects the true edge cases of a real live multimodal model in production.

## Codebase map for discussion

If someone needs to inspect the system quickly, these are the most useful entry points:

- `README.md`: repo-level setup and workflow
- `PRODUCT_SPEC.md`: product framing and original goals
- `extension/manifest.json`: permissions and extension shape
- `extension/sidepanel.js`: UI orchestration, mic/vision capture, metadata gathering
- `extension/src/audioController.js`: protocol/state machine
- `extension/background.js`: active-tab services and command dispatch
- `extension/content.js`: page hint extraction and highlight rendering
- `backend/src/server.js`: protocol surface
- `backend/src/adk/agent.js`: system prompt, tools, mock-vs-real routing
- `tests/harness.js` and `tests/extension_harness.js`: quickest way to understand expected message flows

## Discussion areas for the next roadmap

The raw notes in `ROADMAP_v2.md` map naturally into these technical discussion tracks:

### 1. Richer context for the agent

Question: should the agent receive more than the current frame plus light page hints?

Relevant directions:

- more metadata from the page
- selective DOM or accessibility-tree summaries
- stronger tab context such as language, focused element, page state, or navigation history
- deciding what context is worth the latency, privacy, and implementation cost

### 2. Browser action stream

Question: should the system stream user actions such as tab switches, clicks, or scrolls so the model can stay synchronized with what just happened?

This is currently absent from the architecture.

### 3. Highlight tool evolution

Question: should the highlight become a richer user-visible guidance tool?

Examples:

- voice-controlled size or color
- multiple highlight styles
- better anchoring to detected elements instead of raw point coordinates

### 4. Barge-in quality

Question: how should the app treat small noises, side conversations, or speech that is not actually directed at the assistant?

The current code has a functional interruption path, but not a sophisticated intent/noise policy layer.

### 5. Removing the side panel as a hard dependency

Question: can capture, playback, and session control survive when the panel is closed?

This is likely a real architectural decision rather than a UI tweak.

### 6. User testing and product validity

Question: does the current interaction model genuinely help the target users complete tasks with less confusion and more confidence?

This is not answerable from the codebase alone and needs structured testing.

### 7. TypeScript migration

Question: would moving critical extension/backend modules to TypeScript improve maintainability and reduce ambiguity as the protocol grows?

### 8. More GCP support services

Question: should the system add stronger observability and operations support, such as centralized logging, admin views, or gateway-level controls?

### 9. Frontend redesign

Question: should the extension UI be redesigned now, or only after the runtime architecture and product flows stabilize?

## Bottom line

KindlyClick already has a real technical skeleton: a working Chrome extension, a backend protocol, a mock and real live-session path, a visual pointing tool, and harnesses for testing core interaction loops. The next phase is less about inventing the base architecture and more about deciding how far to push context capture, interruption quality, runtime robustness, and product validation.
