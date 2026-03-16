# T13 Implementation: Interaction Loop Hardening

Updated on March 16, 2026.

## Scope

This note closes T13 in `SEQUENTIAL_AGENT_TODO.md`:

- barge-in and interruption policy
- noise handling
- session persistence depth
- debugging and observability

The goal of T13 was not to make the system perfect. It was to make the live interaction loop predictable enough for structured user testing.

## What changed during T13

### 1. Runtime survivability and state visibility improved

The live runtime was moved out of the side panel and into an offscreen document, with:

- background-managed runtime creation
- side-panel-independent session ownership
- mirrored runtime state for UI recovery
- explicit offscreen lifecycle diagnostics

This reduced one major source of instability during live use: closing the side panel no longer destroys the essential runtime by default.

### 2. Barge-in behavior became acceptable in real use

The current interaction loop now has:

- immediate local `clear_buffer` behavior at the extension
- repeated speech-start detection during playback
- backend-to-extension traceability for interruption events

Manual real Gemini Live testing on March 16, 2026 showed:

- interruption is not instant
- Gemini can still take a few seconds to stop speaking
- despite that lag, the current user judged barge-in behavior acceptable for now

That is enough to treat the current policy as good enough for the next phase.

### 3. Observability improved

Added telemetry now makes interruption behavior diagnosable instead of guesswork:

- `barge_in_detected`
- `barge_in_output_continued`
- `barge_in_resolved`

This is important because future product testing should evaluate user experience, not force another round of low-level debugging first.

### 4. Session behavior is stable enough for user testing

The current system now supports:

- real Gemini Live sessions
- live microphone and vision capture
- highlight tool execution
- runtime survival beyond the side panel
- enough logging to understand interruption behavior during real sessions

## Why T13 can be considered complete

T13 exit criteria were:

- the system behaves more predictably under real usage
- the system provides enough traceability to diagnose failures

Those criteria are now satisfied well enough to move on.

Reasons:

- runtime ownership is more stable than before
- interruption behavior is acceptable to the current user, even if not perfect
- remaining issues are now known, bounded, and observable
- further work on interruption policy would be optimization, not a prerequisite for the next project phase

## Residual risks to carry forward

These are still real, but they are not blockers:

- Gemini barge-in is not instant
- false interruptions from incidental speech or room noise may still occur
- deep session recovery after harder runtime failures is still limited
- the side-panel UI is still utilitarian and not yet product-polished

## Next item

Because T14 was explicitly skipped for time reasons, the next backlog item should be:

- T15 `Apply selective maintainability improvements`
