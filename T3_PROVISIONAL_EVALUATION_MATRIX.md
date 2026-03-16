# T3 Decision: Provisional Evaluation Matrix

Updated on March 16, 2026.

## Purpose

This note answers T3 in `SEQUENTIAL_AGENT_TODO.md`: a first-pass evaluation matrix for comparing context and runtime changes against the current system in a repeatable way.

## Design goal

The matrix should be:

- small enough to run repeatedly
- close to the real senior-user navigation use case
- grounded in existing repo tooling
- explicit about what “better” and “worse” mean

It is provisional on purpose. We do not need a perfect benchmark before T4-T7. We need a stable one.

## Current observability baseline

The repo already gives us useful comparison hooks:

- backend harness coverage for vision understanding, tool loopback, vision stop handling, and audio interruption
- extension harness coverage for controller-level barge-in behavior
- session persistence and tool-call inspection through backend debug routes

That means the evaluation matrix can lean on:

- WebSocket message traces
- harness pass/fail results
- persisted session/tool-call records
- extension timeline artifacts where available

## Representative user tasks

### Task 1. Screen orientation

- Prompt shape: “What do you see?” or “Where am I?”
- Scenario: a familiar page with multiple visible landmarks or states
- Goal: verify whether the assistant correctly identifies the current screen and major actionable regions

Expected assistant behavior:

- correctly identifies the page or screen state
- mentions the most relevant landmarks, not random minor UI
- stays concise and does not hallucinate controls that are not visible

Primary failure classes:

- wrong page identification
- omitted key landmark
- hallucinated element or action
- overly verbose answer that delays progress

### Task 2. Find a target control

- Prompt shape: “Where is the search bar?”, “Where do I click to sign in?”
- Scenario: visible target control exists on screen
- Goal: test whether the assistant can localize one actionable target and optionally point at it

Expected assistant behavior:

- identifies the correct target
- uses spatial language the user can act on
- triggers highlight only when it improves clarity
- highlight lands in the correct area

Primary failure classes:

- wrong target selected
- vague spatial guidance
- correct text answer but incorrect highlight coordinates
- unnecessary or missing highlight

### Task 3. Focus-aware form guidance

- Prompt shape: “What field am I in?”, “What should I type here next?”
- Scenario: user focus is inside a form field or nearby actionable control
- Goal: measure whether added context helps the assistant reason about the user’s current interaction point

Expected assistant behavior:

- identifies the focused field or control
- describes the likely purpose of that field without exposing sensitive values
- suggests the next step in a single, concrete instruction

Primary failure classes:

- assistant cannot identify the focused control
- assistant confuses neighboring fields
- assistant exposes or asks for sensitive content unnecessarily
- assistant gives multi-step advice when one step would do

### Task 4. Post-click state change

- Prompt shape: “Did that work?”, “What changed?”
- Scenario: page state changes after click, route transition, or modal open
- Goal: see whether the assistant stays synchronized across state transitions

Expected assistant behavior:

- notices the state change quickly
- reports the relevant new state, not stale information
- explains whether the action appears successful or blocked

Primary failure classes:

- stale answer based on the previous screen
- misses modal, error, or navigation change
- describes low-value visual noise instead of the meaningful change

### Task 5. Temporary lack of vision

- Prompt shape: “What do you see?” after screen sharing stops
- Scenario: vision feed stops or goes stale
- Goal: verify graceful degradation instead of fabricated answers

Expected assistant behavior:

- explicitly says it cannot currently see the screen
- avoids pretending to know what is on the page
- asks for the minimal corrective step if needed

Primary failure classes:

- fabricated answer despite no vision
- ambiguous or unhelpful failure wording
- repeated confusion loop

### Task 6. Interruption / barge-in

- Scenario: assistant is speaking and the user starts a new utterance
- Goal: confirm responsiveness and turn-taking quality

Expected assistant behavior:

- stops playback promptly
- does not continue speaking over the user
- produces a relevant second response without getting stuck on the first one

Primary failure classes:

- delayed interruption
- no `clear_buffer` or equivalent stop behavior
- first response completes anyway
- second response is delayed or irrelevant

## Scoring dimensions

Each scenario should be scored on these dimensions:

- task success: did the assistant materially help the user complete the step?
- grounding quality: did the answer match the visible/focused UI state?
- actionability: was the next step concrete and easy to follow?
- safety/privacy: did the assistant avoid unnecessary sensitive detail?
- latency: did the response arrive fast enough for live guidance?

Use a simple 0-2 scale per dimension:

- `0`: failed or clearly poor
- `1`: mixed / partially useful
- `2`: correct and useful

That gives a compact score without pretending we have precision we do not yet have.

## Rough latency expectations

These are intentionally rough thresholds for local evaluation, not production SLAs.

### Text or speech start latency

- screen orientation or find-target prompt after fresh vision frame: target under 2.5s, concerning above 4s
- post-click state change explanation after fresh frame: target under 2.5s, concerning above 4s
- vision unavailable response after stop: target under 1.5s, concerning above 3s
- second response after barge-in: target under 2.0s after user end-of-turn, concerning above 3.5s

### Interaction responsiveness

- `clear_buffer` after user interruption starts: target under 500ms from detected second utterance, concerning above 1s
- highlight command after target-finding request: target under 2.5s, concerning above 4s

These thresholds are suitable for before/after comparison even if local mock mode is faster than real Gemini Live.

## Required artifacts for before/after comparison

For every evaluated change, capture:

- commit or working-tree reference
- backend mode: mock vs real Gemini Live
- test scenario identifier
- raw prompt text
- representative screenshot or fixture name
- full outbound metadata payload for the relevant frame
- assistant text response
- command payload if a highlight was emitted
- key timestamps:
  - last vision frame sent
  - user turn end
  - first `text_output`
  - first `audio_output`
  - `command`
  - `clear_buffer` when applicable
- pass/fail notes for obvious regressions

Preferred artifact locations:

- existing harness console output
- extension timeline artifact from `tests/artifacts/extension_timeline.json`
- backend debug session snapshot where tool persistence matters

## Minimum scenario set for repeated comparisons

To keep evaluation lightweight, every before/after run should cover at least:

1. screen orientation
2. find target control
3. focus-aware form guidance
4. post-click or modal state change
5. vision unavailable after stop
6. barge-in interruption

If time is tight, tasks 1, 2, 5, and 6 are the minimum smoke set. Tasks 3 and 4 are the most important additions for context-upgrade evaluation.

## Mapping to current repo tooling

Already covered directly by harnesses:

- screen orientation from vision fixture flow
- find target control via tool loopback
- vision unavailable after stop
- barge-in interruption

Not yet covered cleanly and should be added later:

- focus-aware form guidance
- post-click state change
- precise latency logging across all scenarios
- structured capture of the exact metadata object used for a response

## Evaluation recommendation for upcoming work

For the first context experiment, the most important scenarios are:

1. find target control
2. focus-aware form guidance
3. post-click state change

That is where focused element and viewport/language metadata are most likely to show measurable benefit over the current title/url/headings/buttons payload.

## Exit criteria check

T3 requires:

- representative user tasks
- expected assistant behaviors
- obvious failure classes
- rough response-latency expectations
- required logs or artifacts for before/after comparison

This note provides each of those in a compact form that can be reused in T4-T7.
