# T11 Research: Runtime Architecture Beyond The Side Panel

Updated on March 16, 2026.

## Purpose

This note answers T11 in `SEQUENTIAL_AGENT_TODO.md`: compare options for keeping session control, capture, and playback alive when the side panel closes, and select one direction.

## Current runtime ownership

Today the side panel owns almost all live-session responsibilities:

- backend WebSocket connection
- microphone capture
- response playback
- screen-share capture loop
- session state and UI state

The background service worker is currently only a helper for:

- active-tab lookup
- content-script messaging
- permission helper tab opening
- highlight dispatch
- recent navigation summaries

That means closing the side panel tears down the actual live runtime.

## Relevant Chrome platform constraints

Grounding constraints from current Chrome extension docs:

- service workers are still ephemeral and should not be treated as a persistent DOM/media host
- service workers can keep WebSockets alive in modern Chrome, but only with active traffic/keepalive discipline
- service workers do not have DOM access
- offscreen documents provide a hidden document context and now support reasons including `USER_MEDIA`, `DISPLAY_MEDIA`, and `AUDIO_PLAYBACK`
- offscreen documents expose only `chrome.runtime` from extension APIs, so they are not a full background-page replacement
- `tabCapture` plus offscreen documents is a viable background recording path if the product is willing to scope vision to browser tabs rather than arbitrary shared windows

## Option comparison

### Option A. Keep the side panel as the runtime host

What it means:

- no architectural change
- continue using the side panel for capture, playback, and session control

Pros:

- simplest
- already working

Cons:

- fails the main requirement directly
- closing the side panel still destroys the session
- no durable base for richer event or context capture

Decision:

- reject

### Option B. Service worker owns session state, offscreen document owns media

What it means:

- service worker becomes the runtime coordinator
- offscreen document handles microphone capture, display capture, audio playback, and any DOM/media APIs
- side panel becomes a thin control surface only

Pros:

- fits MV3 better than trying to force everything into the service worker
- runtime can survive side-panel closure
- responsibilities are clear:
  - service worker: session orchestration, routing, keepalive, commands
  - offscreen document: audio/vision media work

Cons:

- more messaging complexity
- state has to be synchronized across service worker, offscreen document, and side panel
- service-worker lifetime discipline still matters for WebSocket reliability

Decision:

- viable

### Option C. Offscreen document as the primary runtime host, service worker as router/helper

What it means:

- the offscreen document owns the WebSocket session plus media capture/playback
- the service worker mainly creates/maintains the offscreen document and routes extension events/messages
- side panel becomes a controller and status UI

Pros:

- the runtime host remains a document context, which matches the current need for:
  - `AudioContext`
  - `audioWorklet`
  - `getUserMedia`
  - `getDisplayMedia`
  - playback
- requires less splitting of media/session logic than Option B
- likely the smallest conceptual migration from the current side-panel-hosted design

Cons:

- offscreen documents are intentionally constrained and should not become a general dumping ground
- only `chrome.runtime` is exposed directly from extension APIs in the offscreen context
- lifecycle semantics still need careful handling

Decision:

- recommended

### Option D. Dedicated extension tab/window as the runtime host

What it means:

- move the runtime from side panel to a separate visible extension page

Pros:

- technically simple
- document context available for all current media logic

Cons:

- poor UX
- still user-closeable
- feels like a workaround, not a product architecture

Decision:

- reject

## Recommended direction

Choose:

- offscreen document as the primary runtime host
- service worker as lifecycle manager and message router
- side panel as optional controller/status UI

## Why this direction is best

It best matches the current codebase and Chrome constraints.

### 1. It preserves the document-based media model

The current runtime depends on:

- `AudioContext`
- `AudioWorklet`
- microphone streams
- display capture
- audio playback

Those are already implemented in a document context. Moving them into an offscreen document is a cleaner migration than trying to refactor media handling around a service worker.

### 2. It decouples runtime survival from the UI

The side panel can become:

- connect/disconnect controls
- status display
- logging/diagnostics surface

instead of being the actual host of the live session.

### 3. It keeps the architecture incremental

The likely smallest T12 path is:

- move `AudioController` hosting and media loops out of `sidepanel.js`
- keep background/content messaging patterns largely intact
- add only the runtime-management glue needed to create and talk to the offscreen document

That is a much narrower change than a full protocol redesign.

## Vision capture choice inside the recommended direction

There are two sub-options:

### C1. Keep `getDisplayMedia`

Pros:

- preserves current “tab or window” share behavior
- least product-behavior change

Cons:

- still requires user share selection UX
- offscreen document capture behavior needs careful validation in practice

### C2. Move to `tabCapture`

Pros:

- stronger fit for browser navigation assistance
- better background/runtime story with service worker plus offscreen document

Cons:

- narrows product scope from “tab or window” to tab-oriented capture
- changes the user-facing capture model

Recommendation:

- do not force the `tabCapture` decision in T11
- for T12, prefer the direction that preserves the current product shape first
- evaluate `tabCapture` later only if it materially simplifies reliability

## Main risks in the recommended direction

### Lifecycle risk

- offscreen and service-worker lifecycle interactions still need real testing

### Permission/surface risk

- the manifest will need additional permission work such as `offscreen`

### Complexity risk

- messaging between side panel, service worker, offscreen document, and content scripts can become brittle if not kept narrow

### Debuggability risk

- once runtime state is no longer visible in the side panel by default, diagnostics need better trace surfaces

## What T12 should actually do

T12 should not attempt a total rewrite.

The smallest foundational change should be:

1. create an offscreen runtime document
2. move live session ownership there
3. let the side panel send control commands and receive status updates through `chrome.runtime` messaging
4. keep the background worker responsible for creation, routing, and page-command dispatch

That is enough to test whether closing the side panel can stop destroying the session.

## Decision

Selected direction:

- offscreen runtime document + service-worker coordinator

Rationale:

- best fit with current media-heavy implementation
- smallest migration from the present codebase
- satisfies the side-panel-independence goal without inventing a new visible runtime surface

## Sources

Primary references used for this note:

- Offscreen API: https://developer.chrome.com/docs/extensions/reference/api/offscreen
- WebSockets in extension service workers: https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets
- Audio recording and screen capture in extensions: https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture
- Offscreen documents in MV3: https://developer.chrome.com/blog/Offscreen-Documents-in-Manifest-v3
- Longer extension service worker lifetimes: https://developer.chrome.com/blog/longer-esw-lifetimes
- MV3 known issues / improvements: https://developer.chrome.com/docs/extensions/develop/migrate/known-issues
