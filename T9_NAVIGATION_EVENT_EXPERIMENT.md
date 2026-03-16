# T9 Implementation: Navigation Event Experiment

Updated on March 16, 2026.

## What was implemented

The first event-stream experiment was implemented as a tiny navigation-summary path.

Added behavior:

- the background worker records recent top-level navigation transitions per tab
- only summarized events are retained
- the side panel includes those summaries in the existing frame `metadata`
- the real Gemini Live metadata note now includes recent navigation summaries

## Event subset

This implementation covers:

- navigation committed when the tab URL changes
- navigation completed when the tab finishes loading

It does not yet cover:

- raw clicks
- focus streams
- scroll streams
- mutation streams
- keyboard events

## Boundedness

The implementation is intentionally narrow:

- max 5 recent navigation events per tab
- retention window around 30 seconds
- duplicate suppression for repeated navigation updates

That keeps the event path understandable and reversible.

## Main code paths

- background capture: `extension/background.js`
- metadata wiring: `extension/sidepanel.js`
- model-visible framing: `backend/src/adk/geminiLiveSession.js`

## Why this fits the backlog

This is the smallest event subset that helps with:

- “did that work?”
- “what changed?”
- keeping the agent synchronized across page transitions

without opening the privacy and prompt-bloat problems that raw interaction streams would create.

## Verification

Existing backend regression coverage still passed after the change:

- vision summary
- tool loopback
- focus comparison
- sensitive-field guard
- state change scenario
- vision stop guard
- barge-in

## Known limitations

- current capture uses tab update signals, so it is still coarse
- same-document route changes depend on what Chrome surfaces through tab updates on the tested site
- the current harness does not yet isolate the value of navigation summaries specifically
- event summaries are visible to the model, but they are not yet scored separately in evaluation

## Next step

The next backlog item is T10:

- evaluate whether navigation summaries actually improve synchronization or quality
- decide whether prompt framing or tool contracts should change further
