# ISSUE_BARGE-IN_001

## Summary

During a live Gemini session, user speech was detected while the agent was speaking, but the agent's audio did not remain stopped. Local playback was cleared, then audio output resumed from the same stream and completed normally.

This means barge-in is only partially working:

- speech detection works
- local playback clear works
- upstream Gemini response cancellation is not reliably happening

## Date Observed

- March 7, 2026

## Scope

- Backend live adapter: [backend/src/adk/geminiLiveSession.js](/home/pat/kindlyclick/backend/src/adk/geminiLiveSession.js)
- Extension controller: [extension/src/audioController.js](/home/pat/kindlyclick/extension/src/audioController.js)
- Captured backend log: `/tmp/kindlyclick-live.log`

## Confirmed Evidence

The captured log showed the following sequence:

- WebSocket connected
- Gemini Live connected
- microphone permission granted
- microphone started
- audio capture started
- audio output started
- `vad_event=speech_start`
- `clear_buffer received (barge_in)`
- audio output started again on the same stream id
- audio output ended normally

Relevant lines from `/tmp/kindlyclick-live.log`:

- `WebSocket connected from 127.0.0.1:43982`
- `Gemini Live connected for session extension-1772816253209-738 (model=gemini-live-2.5-flash-native-audio)`
- `[client-log] ... "message":"microphone started"`
- `[client-log] ... "message":"audio_output_start (extension-1772816253209-738-stream-1)"`
- `[client-log] ... "message":"vad_event=speech_start"`
- `[client-log] ... "message":"clear_buffer received (barge_in)"`
- `[client-log] ... "message":"audio_output_start (extension-1772816253209-738-stream-1)"`
- `[client-log] ... "message":"audio_output_end (extension-1772816253209-738-stream-1)"`

## Current Behavior

The backend and extension currently do this:

1. Detect speech start from Gemini VAD signals or fresh input during active playback.
2. Emit `clear_buffer` to the extension.
3. Clear the local audio queue in the extension.

This stops playback momentarily, but it does not guarantee that the upstream Gemini response stops generating.

## Root Cause Assessment

The most likely issue is architectural rather than purely UI-side:

- The current implementation treats barge-in primarily as a local playback-clear event.
- The backend does not currently force termination of the active Gemini Live response when barge-in occurs.
- As a result, the model can continue streaming more output after the client has cleared its buffer.

## SDK / API Findings

Investigation of the installed `@google/genai` SDK found:

- `LiveClientContent` interrupts current model generation, but it also appends content to conversation history.
- `sendRealtimeInput(...)` is intended for ongoing audio/video and does not provide an obvious direct cancel-current-response helper on the live session object.
- The session object exposes `close()`.
- The SDK types expose realtime input config with `activityHandling`.
- `ActivityHandling.START_OF_ACTIVITY_INTERRUPTS` is the intended built-in barge-in mode.

Important implication:

- A true cancel should not be faked by sending synthetic `sendClientContent(...)` turns unless we intentionally want to mutate conversation history.

## Design Options Considered

### Option A: Rely on native Gemini barge-in only

Make `activityHandling: START_OF_ACTIVITY_INTERRUPTS` explicit in the Live config and trust the service to stop generation.

Pros:

- semantically correct
- preserves session continuity
- minimal code change

Cons:

- observed behavior suggests this may not be sufficient in practice
- if the service continues output, user experience remains broken

### Option B: Local playback clear only

This is effectively the current behavior.

Pros:

- simple
- immediate audible stop at the client

Cons:

- not a real cancel
- output can resume
- interrupted-turn tool calls or text may still leak through

### Option C: Hard-stop the live session on barge-in

On speech start during active playback, clear local playback and close/recreate the Gemini Live session.

Pros:

- robust
- guarantees the interrupted response cannot continue
- works without a dedicated per-response cancel API

Cons:

- blunt approach
- may lose in-memory session state inside the live stream
- introduces reconnect timing and race-condition concerns

## Recommended Direction At Time Of Investigation

No implementation decision was finalized.

If resumed later, the safest likely direction is:

1. Explicitly configure `activityHandling: START_OF_ACTIVITY_INTERRUPTS`
2. Keep `clear_buffer` for immediate client silence
3. Add a hard-reset fallback if output continues after barge-in
4. Add explicit logs for:
   - barge-in detected
   - clear sent
   - stream interrupted
   - live session restarted

## Related Observations

- The same captured session did successfully connect to Gemini Live.
- A tool call was confirmed in the same run: `command executed (DRAW_HIGHLIGHT)`.
- The captured log did not prove vision ingestion for that manual run because no `vision_input_ack` lines were present.

## Status

- Open
- Decision deferred

