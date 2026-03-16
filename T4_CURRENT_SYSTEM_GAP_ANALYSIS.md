# T4 Research: Current System Gap Analysis

Updated on March 16, 2026.

## Purpose

This note answers T4 in `SEQUENTIAL_AGENT_TODO.md`: a gap analysis of the current system against the provisional evaluation matrix in `T3_PROVISIONAL_EVALUATION_MATRIX.md`.

## Executive summary

KindlyClick already has a solid transport and harness foundation for:

- low-rate vision frame delivery
- text/audio response plumbing
- barge-in interruption
- highlight tool loopback
- minimal session and tool-call persistence

The main gaps are not in the socket plumbing. They are in what the model can actually use and what we can actually evaluate.

The biggest immediate gap is:

- vision-frame `metadata` is collected and transported, but in the real Gemini Live path it is not actually sent to the model as model-readable context

That means a future “context upgrade” implemented only in extension capture would not be a real experiment in live mode.

## 1. Extension capture and metadata

### What the system already supports

- side-panel runtime captures microphone audio and vision frames
- active-tab metadata collection includes:
  - page title
  - page URL
  - tab ID
  - heading hints
  - button hints
- metadata is attached to vision-frame messages without changing the transport shape

### Gaps against the evaluation matrix

#### Gap A: current metadata is too shallow for focus-aware guidance

Impact on T3 tasks:

- weak for Task 3: focus-aware form guidance
- weak for Task 4: post-click state change
- only moderately useful for Task 2: find target control

Why:

- no focused element summary
- no page language or browser language
- no viewport geometry or scroll position
- no dialog/modal state
- no error/banner summary
- no recent navigation or recent interaction summary

#### Gap B: metadata capture is side-panel-triggered, not statefully tracked

Impact on T3 tasks:

- weak continuity for Task 4: post-click state change

Why:

- `getActiveTabMetadata()` is called when frames are sent, but the extension does not maintain a structured current-page state model
- that is acceptable for narrow present-state metadata, but it limits any richer transition-aware evaluation

#### Gap C: privacy posture is implicit, not encoded

Impact on T3 tasks:

- increases risk for future form-oriented experiments

Why:

- there is no explicit redaction layer yet
- there are no field-level rules such as “never capture input values” because values are not captured today
- that is safe enough for the current baseline, but it becomes a real requirement as soon as focused controls or nearby labels are added

## 2. Backend protocol and state

### What the system already supports

- `realtime_input` accepts vision frames plus arbitrary `metadata`
- `vision_status` tracks active/inactive vision state
- session start and tool-call persistence work
- mock and real live-session adapters share the same outer WebSocket protocol

### Gaps against the evaluation matrix

#### Gap D: metadata reaches the backend but not the real model

Impact on T3 tasks:

- blocks meaningful evaluation of context upgrades in real Gemini mode

Why:

- the backend receives `metadata` on `realtime_input`
- the Gemini Live adapter sends only the image blob via `sendRealtimeInput({ media })`
- the `metadata` object is preserved only in the local `vision_input_ack` event, not as model-visible context

Consequence:

- current T2/T5 context ideas would help mock mode or debug traces only, unless the real Live path is updated to send metadata in a compact text/structured form

This is the most important finding in the audit.

#### Gap E: session persistence is too thin for evaluation or replay

Impact on T3 tasks:

- weak support for comparing behavior across runs

Why:

- session records store startup metadata and appended tool calls
- no persisted assistant responses
- no persisted user prompts
- no persisted frame metadata timeline
- no persisted latency markers
- no persisted vision-status transitions

#### Gap F: protocol lacks explicit evaluation markers

Impact on T3 tasks:

- harder before/after latency comparison

Why:

- the transport includes `_meta.clientTs` and `_meta.serverTs`
- but there is no explicit scenario ID, no frame correlation ID, and no response-to-frame linkage
- this makes it harder to say exactly which metadata object or frame the assistant answer depended on

## 3. Prompt and tool contracts

### What the system already supports

- a simple system prompt with the KindlyClick persona and tool instruction
- one tool declaration: `draw_highlight`
- vision-unavailable guardrails in both mock and real adapters
- coordinate normalization for highlight rendering

### Gaps against the evaluation matrix

#### Gap G: the system prompt is too generic for richer context use

Impact on T3 tasks:

- limits usefulness of future metadata additions

Why:

- the current prompt says the model can hear the user and see screen frames
- it does not explain what structured metadata is available
- it does not tell the model how to prioritize focused element, dialog state, or viewport information if those are added

#### Gap H: tool contract is adequate for pointing, but weak for evaluation semantics

Impact on T3 tasks:

- mostly Task 2: find target control

Why:

- `draw_highlight` carries coordinates and an optional label
- it does not anchor the highlight to a semantic target identity
- this makes it harder to judge whether the model chose the correct UI element versus just a roughly plausible coordinate

This is not the first problem to fix, but it will matter once evaluations get stricter.

#### Gap I: mock-mode behavior may overstate readiness

Impact on T3 tasks:

- all of them, especially T2/T7 evaluation

Why:

- mock mode infers scene type from title/URL/image fixture and returns deterministic answers
- it is useful for protocol regression tests
- it is not a reliable signal that a real model will use new metadata well

## 4. Logging, replayability, and observability

### What the system already supports

- extension controller trace hooks
- optional client-log relay into backend stdout
- backend `/debug/sessions/:id` endpoint
- extension harness timeline artifact
- harness-level pass/fail output

### Gaps against the evaluation matrix

#### Gap J: manual runtime traces are available in code but not surfaced by default

Impact on T3 tasks:

- weak manual debugging during local experiments

Why:

- `AudioController` supports `traceFn`
- the side panel passes a no-op trace function
- manual runs therefore do not capture a durable ordered event trace unless the harness is used

#### Gap K: metadata used for a response is not captured as a first-class artifact

Impact on T3 tasks:

- blocks clean before/after comparison for context experiments

Why:

- harnesses send metadata, but current outputs do not systematically store the exact outbound metadata object alongside the assistant response
- this makes it difficult to audit whether a bad answer came from weak metadata, bad model use, or a transport mismatch

#### Gap L: latency measurement exists implicitly, not explicitly

Impact on T3 tasks:

- all latency-related comparisons

Why:

- timestamps exist in traces and message metadata
- but there is no summary artifact that computes:
  - frame-to-answer latency
  - turn-end-to-first-audio latency
  - interruption-to-clear-buffer latency
  - prompt-to-highlight latency

#### Gap M: replayability is partial

Impact on T3 tasks:

- especially Task 3 and Task 4

Why:

- current fixtures cover generic vision and interruption flows
- there is no dedicated fixture set for:
  - focused form fields
  - modal openings
  - validation errors
  - route transitions

## Best first small experiment landing zone

The first small experiment should land in two places, not one:

1. extension/content capture
2. real Gemini Live metadata framing

Reason:

- adding richer metadata only on the extension side would not reach the real model today
- changing only the backend prompt/framing without better metadata would not solve the underlying ambiguity

The narrowest worthwhile experiment looks like:

- add focused element + language + viewport/scroll metadata in the extension
- send a compact text/structured metadata note into the real Live session alongside the latest frame or user turn
- keep the change reversible and bounded to the existing vision-metadata path

## Recommended first additional evaluation coverage

Before or alongside the first context implementation, add harness coverage for:

- focused form-field identification
- post-click/modal state change
- artifact capture of exact metadata payload and key timestamps

Without those, T7 would be forced to rely too heavily on anecdotal manual testing.

## Priority-ordered gaps

1. metadata is not model-visible in real Gemini Live
2. no focused-element / viewport / language capture
3. no first-class metadata artifact for before/after comparisons
4. no harness scenario for focus-aware form guidance
5. no harness scenario for post-click state change
6. tool semantics remain coordinate-only
7. persistence is too shallow for deeper replay

## Exit criteria check

T4 requires a gap analysis for:

- extension capture and metadata
- backend protocol and state
- prompt/tool contracts
- logging, replayability, and observability

This note covers each area and identifies the best first experiment landing zone: a narrow end-to-end metadata upgrade that is visible to the real model, not just to the transport layer.
