# T5 Decision: First Context Upgrade To Try

Updated on March 16, 2026.

## Decision

The first context slice to implement should be:

- focused element summary
- page language
- browser UI language
- viewport width/height and scroll position

Treat this as one narrow “present-state context” bundle rather than four unrelated features.

## Why this is the first slice

This bundle is the best tradeoff across:

- likely usefulness to Gemini Live
- implementation cost
- latency/payload impact
- privacy risk

It is also the cleanest response to the T4 audit, which showed that the current system is weak at focus-aware guidance and post-click synchronization.

## Likely usefulness to Gemini Live

This slice directly addresses the most obvious blind spots in the current payload.

### Focused element summary

Most likely value:

- strongest candidate for improving “What field am I in?”
- strongest candidate for improving “What should I click/type next?”
- likely to reduce confusion between nearby controls that look similar in screenshots

Why it matters:

- screenshots and heading/button hints do not tell the model what the user is actively interacting with
- a focused-element summary is a compact disambiguator, not a firehose

### Page and browser language

Most likely value:

- helps with multilingual pages
- helps align UI text expectations with speech behavior
- cheap enough that there is little reason not to include it

### Viewport and scroll state

Most likely value:

- tells the model what part of a page is actually visible now
- improves grounding for spatial guidance and “what changed?” questions
- useful for coordinate-based highlighting and general orientation

## Implementation cost

This slice is small enough to implement without reshaping the architecture.

Expected implementation scope:

- extend content-script extraction
- enrich extension metadata assembly
- forward the resulting metadata to the backend as today
- make the real Gemini Live path expose that metadata to the model in compact form

Why cost stays reasonable:

- the transport already supports `metadata` on vision frames
- these fields are available from the current page/runtime with low extraction complexity
- no raw event stream, DOM snapshot, or accessibility-tree dump is required

What keeps it from being “free”:

- focused element extraction needs careful trimming
- privacy guardrails must be explicit
- the real Live path needs a metadata-to-model bridge because raw metadata is not currently model-visible

## Latency impact

The expected latency cost is low if the slice is kept compact.

Why:

- language fields are negligible
- viewport/scroll values are just a few numbers
- focused-element summary is small if limited to:
  - tag
  - role
  - type
  - disabled/read-only state
  - short label
  - rough bounds

What to avoid:

- no field values
- no large nearby-text dumps
- no repeated verbose metadata narration injected on every frame

The backend framing should therefore prefer a short structured note, not a paragraph dump.

## Privacy impact

This slice has manageable privacy risk if we enforce strict defaults.

Safe defaults:

- never capture input values
- never capture password or masked-field contents
- do not include selected text
- keep labels short and sanitized
- prefer presence/shape/state over raw user-authored content

Residual risk:

- field labels can still reveal workflow context such as “Social security number” or “Card number”

Mitigation:

- add a basic sensitive-field filter from the start
- if a field appears sensitive, downgrade to generic metadata such as:
  - `role=input`
  - `type=password`
  - `sensitive=true`

## Why not the other candidates first

### Not event streaming

- higher noise
- harder to evaluate cleanly
- greater privacy and prompt-bloat risk

### Not full accessibility summaries

- more complex
- larger payload
- weaker first experiment than a focused-element slice

### Not route/history context first

- less directly useful than knowing the current focus and visible region
- easier to mis-handle from a privacy standpoint

### Not banner/error text first

- potentially useful, but more content-sensitive
- weaker universal benefit than focused element plus viewport

## Required implementation constraint

This experiment counts only if the selected metadata is visible to the real Gemini Live model, not just:

- present in extension logs
- present in backend debug acks
- used by mock-mode heuristics

So the implementation target for T6 is not just capture. It is end-to-end model-visible capture.

## Recommendation for T6 scope

Keep T6 narrow:

1. capture the selected fields
2. add redaction/omission rules for sensitive inputs
3. make the real Live adapter send the metadata in compact model-readable form
4. avoid any broader prompt redesign or event-stream work

## Exit criteria check

T5 requires one selected context slice with reasons covering:

- likely usefulness to Gemini Live
- implementation cost
- latency impact
- privacy impact

This note selects:

- focused element summary + language + viewport/scroll metadata

and justifies that choice across all four criteria.
