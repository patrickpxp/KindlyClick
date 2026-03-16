# T1 Research: Model and Platform Envelope

Updated on March 11, 2026.

## Purpose

This note answers T1 in `SEQUENTIAL_AGENT_TODO.md`: what Gemini Live is likely to use well, what context is expensive or risky, what Chrome extension limits matter, and what privacy-sensitive data should stay out by default.

## Repo baseline

KindlyClick currently sends:

- microphone audio as 16 kHz mono PCM
- 1280x720 JPEG screen frames at 1 FPS
- lightweight page metadata: page title, page URL, tab ID, heading hints, button hints

That behavior lives primarily in `extension/sidepanel.js`, `extension/background.js`, and `extension/content.js`. The backend currently connects to Gemini Live with audio output plus tool declarations, but it does not yet configure session compression, session resumption, language hints, or transcription settings.

## What Gemini Live is likely to use effectively

### Good candidates for additional context

The Live API is best treated as a low-latency multimodal loop, not as a place to dump raw browser state. The most plausible high-value additions are concise structured facts that disambiguate the current screen without forcing the model to infer everything from pixels.

Best candidates:

- focused element summary: tag, label/text, role, disabled state, and rough screen position
- browser/page language: browser UI language and page language when available
- viewport and frame relationship: viewport size, scroll position, and whether the shared frame is the full page or a cropped view
- recent navigation summary: "navigated to X", "dialog opened", "same-page route change", not the full event stream
- short interaction summary: last 1-3 meaningful actions such as click target text or focused control change
- selective semantic page hints: current form title, visible landmarks, active dialog title, visible error banner text

Why these are plausible:

- Gemini Live supports multimodal realtime input, but its session limits still force compression discipline.
- Google recommends summarizing longer context instead of replaying the full history, and the Live API exposes context window compression and session resumption rather than assuming clients will keep sending everything forever.
- Language metadata can improve speech behavior and transcription alignment with very little payload cost.

## What is likely to add latency, payload cost, or noise

### Expensive or noisy additions

- full DOM snapshots or large accessibility-tree dumps on every frame
- raw click/scroll/focus events at high cadence
- full-page OCR text or repeated visible-text dumps every second
- full URLs including long query strings and opaque tracking parameters
- background-tab state, tab-strip inventory, or unrelated browser windows
- high-frequency screenshots above the current 1 FPS loop unless a concrete evaluation requires them
- replaying full turn transcripts back into every live session turn

Why these are risky:

- Live sessions still have hard limits. Google documents a 10 minute session duration and a 32k token context window for audio/video sessions without compression.
- Audio adds up quickly, and Google documents explicit token accounting for multimodal inputs. More raw context competes directly with the user's actual task.
- Event firehoses are especially likely to lower signal quality because they add time-ordered noise that the model must filter before answering.

## Chrome extension and browser limits that matter

### MV3 runtime constraints

- Extension service workers are ephemeral. Chrome terminates them after short idle periods, so they are not a safe place to assume long-lived conversational state without reconnection logic.
- Service workers do not have DOM access. Anything that depends on page inspection, canvas, or media elements must live in a document context such as the side panel, content script, or an offscreen document.
- Offscreen documents can help move some document-only work out of the side panel, but they intentionally expose only `chrome.runtime` from extension APIs. They are not a general replacement for all extension capabilities.

### Page access constraints

- Content scripts can inspect the DOM, but they run in an isolated world. They can read the page DOM and extract summaries, but integration with page JavaScript is indirect and should stay narrow.
- Match patterns and permissions still matter. `activeTab` gives temporary access after a user gesture; broad host permissions such as `<all_urls>` are more invasive and trigger stronger review and warning implications.
- Some pages remain unavailable or constrained. Browser-internal pages and restricted schemes are not normal content-script targets, and `file://` access is a special case that often requires explicit user enablement.

### Product implication for KindlyClick

Because the current runtime lives in the side panel, any context capture that depends on side-panel lifetime is fragile by design. T1 does not require changing that architecture, but it means T2 should prefer context that can be gathered cheaply from the active tab on demand instead of building a stateful capture pipeline that assumes the side panel never closes.

## Privacy-sensitive categories to exclude by default

This section is partly an inference from Chrome's privacy guidance and the product's assistive use case. The default posture should be data minimization: capture only what is needed to answer the current navigation question.

Exclude by default:

- passwords, OTP codes, passkeys, security answers, and any masked-field contents
- payment-card numbers, bank details, tax records, invoices, and checkout autofill payloads
- email bodies, chat message contents, documents, and other freeform user-authored text unless the user is explicitly asking for help with that content
- health, insurance, benefits, or government-ID information
- precise location, contact lists, calendar contents, downloads, clipboard data, and local file contents
- full URLs with sensitive paths or query strings; prefer origin plus a short redacted route label when possible
- background tabs or unrelated windows

## Cheap, risky, and unknown

### Plausible and cheap

- browser UI language
- page language
- focused element summary
- active dialog/banner title
- scroll position and viewport size
- last navigation transition summary

### Moderate cost or moderate risk

- visible form-field labels near the focused element
- small accessibility summaries for only the currently relevant region
- short recent-action summary with strict retention limits
- selected text when the user explicitly asks about the selected text

### Expensive, risky, or still unknown

- full accessibility-tree streaming
- full DOM serialization
- continuous event streaming beyond a tiny curated subset
- cross-tab browsing history context
- broad content capture on pages containing personal communications or regulated data

## Repo-specific gaps relative to this envelope

- The extension already captures basic title/URL/heading/button hints, but it does not capture focused element state, language, dialog state, viewport geometry, or redacted navigation summaries.
- The backend sends vision frames and audio, but the Live session config does not yet take advantage of compression or language/transcription options that could improve traceability and session hygiene.
- The manifest currently asks for broad access (`tabs`, `activeTab`, `scripting`, and `<all_urls>`). That is workable for prototyping, but it increases privacy and review surface area compared with a more selective permission model.

## Recommendation for T2

Use T2 to build the candidate inventory around one principle: prefer concise state summaries that explain what the user is probably looking at right now, and avoid raw high-volume streams unless they replace an actual ambiguity the model cannot resolve from the current frame plus lightweight semantics.

The first T2 candidate I would expect to rank near the top is:

- focused element summary plus page/browser language plus viewport/scroll metadata

That bundle is likely cheap, easy to explain, and materially more useful than a firehose of raw events.

## Sources

Primary sources used for this note:

- Gemini API Live API capabilities: https://ai.google.dev/gemini-api/docs/live-api/capabilities
- Gemini API Live session management: https://ai.google.dev/gemini-api/docs/live-session
- Gemini API Live best practices: https://ai.google.dev/gemini-api/docs/live-api/best-practices
- Gemini API media resolution: https://ai.google.dev/gemini-api/docs/media-resolution
- Chrome Extensions service worker lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Chrome Extensions activeTab: https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- Chrome Extensions content scripts: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Chrome Extensions declare permissions: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- Chrome Extensions match patterns: https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
- Chrome Extensions offscreen API: https://developer.chrome.com/docs/extensions/reference/api/offscreen
- Chrome Extensions user privacy guidance: https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy
