# KindlyClick Sequential Agent TODO

Updated from the repository state on March 16, 2026.

## Status

Completed through:

- T13 `T13_INTERACTION_LOOP_HARDENING.md`
- T15 `T15_SELECTIVE_MAINTAINABILITY_IMPROVEMENTS.md`
- T16 `T16_REDESIGN_EXTENSION_UI.md`

Current next item:

- No default next item. Choose the next phase intentionally.

## Purpose

This file is the ordered working backlog for discussing and executing improvements to KindlyClick while keeping each turn small enough for a separate coding agent.

The sequence is intentionally research-first. We should not implement major changes before we understand:

- what Gemini Live is likely to benefit from
- what Chrome extension/runtime constraints apply
- what latency, privacy, and complexity costs each option introduces

If a research item is inconclusive, the default rule is:

1. choose the easiest and cleanest implementation path
2. keep the change narrow and reversible
3. test it ourselves against a fixed before/after scenario
4. use that result to decide whether to continue, expand, or abandon it

## How to use this backlog

Each item is designed to be assigned to a different coding agent.

For every item, the assigned agent should produce one of these outcomes:

- a short decision note
- a code change
- an evaluation result
- an updated recommendation for reordering downstream items

Unless a later item is explicitly pulled forward, work should proceed in order.

## Item Format

Each item includes:

- `Type`: research, decision, implementation, or evaluation
- `Why now`: why it belongs at this point in the sequence
- `Deliverable`: the expected output from the assigned agent
- `Exit criteria`: what must be true before moving on

## Ordered TODO

### T1. Research the model and platform envelope

- Type: Research
- Why now: We need to know what Gemini Live and the browser platform can realistically support before defining detailed benchmarks or implementation work.
- Deliverable: A short note covering:
  - what kinds of additional context Gemini Live is likely to use effectively
  - what kinds of context are likely to increase latency or payload cost
  - what browser-extension APIs and runtime limitations matter for context capture
  - what privacy-sensitive categories should be excluded by default
- Exit criteria: We have a grounded summary of what is plausible, cheap, risky, and unknown.

### T2. Build a possible context inventory

- Type: Decision
- Why now: After platform research, we need a concrete menu of candidate signals we could capture.
- Deliverable: A categorized inventory of possible agent inputs, grouped as:
  - almost free / low risk
  - moderate cost / moderate risk
  - expensive, noisy, or privacy-sensitive
- Exit criteria: We have a ranked list of candidate context signals and a recommendation for the first one to test.

### T3. Define a provisional evaluation matrix

- Type: Decision
- Why now: Research should inform what we test. We do not need a perfect benchmark yet, but we do need a consistent way to compare iterations.
- Deliverable: A first-pass matrix with:
  - representative user tasks
  - expected assistant behaviors
  - obvious failure classes
  - rough response-latency expectations
  - required logs or artifacts for before/after comparison
- Exit criteria: We can run the same scenarios repeatedly and judge whether a change helped or hurt.

### T4. Audit the current system against the evaluation matrix

- Type: Research
- Why now: Before changing anything, we should map the current implementation to the matrix and identify the biggest gaps.
- Deliverable: A gap analysis for:
  - extension capture and metadata
  - backend protocol and state
  - prompt/tool contracts
  - logging, replayability, and observability
- Exit criteria: We know what the system already supports, what is missing, and where the first small experiment should land.

### T5. Research and choose the first context upgrade

- Type: Research
- Why now: We should not add multiple metadata ideas at once. We need one high-signal, low-risk candidate.
- Deliverable: A decision note selecting the first context addition to try, with reasons covering:
  - likely usefulness to Gemini Live
  - implementation cost
  - latency impact
  - privacy impact
- Exit criteria: One context slice is selected for implementation.

### T6. Implement the first context slice

- Type: Implementation
- Why now: This is the first practical experiment informed by research.
- Deliverable: A narrow code change that adds the selected context signal end to end where appropriate.
- Exit criteria: The feature works locally, is testable, and is small enough to roll back cleanly if it provides no value.

### T7. Evaluate the first context slice

- Type: Evaluation
- Why now: We need evidence before stacking on additional complexity.
- Deliverable: A before/after result using the provisional evaluation matrix, including:
  - observed quality differences
  - observed latency differences
  - regressions or ambiguities
- Exit criteria: We have a recommendation to keep, refine, revert, or replace the new context slice.

### T8. Research browser event streaming

- Type: Research
- Why now: Static context should be tested first. Event streaming is more invasive and can easily create noise.
- Deliverable: A note answering:
  - which user/browser events are likely worth sending
  - whether raw events or higher-level summaries are better
  - what cadence and retention policy make sense
  - what event volume or prompt bloat risks exist
- Exit criteria: We know whether event streaming is promising and which smallest subset is worth trying first.

### T9. Implement the smallest event-stream experiment

- Type: Implementation
- Why now: If event streaming is worth trying, we should start with a tiny slice, not a firehose.
- Deliverable: A minimal implementation of one narrow event subset, such as:
  - navigation transitions
  - focused element changes
  - clicks on actionable controls
- Exit criteria: The event stream is stable, understandable in logs, and limited enough to evaluate cleanly.

### T10. Evaluate event streaming and revise prompt/tool contracts

- Type: Evaluation
- Why now: Additional context only matters if the model uses it coherently.
- Deliverable: A combined note covering:
  - whether event streaming improved assistant synchronization or quality
  - whether prompt framing or tool contracts should change
  - whether highlight commands need better anchoring semantics than raw coordinates
- Exit criteria: We know whether to expand event streaming and how the agent contract should evolve.

### T11. Research runtime architecture beyond the side panel

- Type: Research
- Why now: Side-panel independence is a major design decision and should follow a clearer understanding of the runtime’s real responsibilities.
- Deliverable: An architecture note comparing options for keeping session control, capture, and playback alive when the side panel closes.
- Exit criteria: One runtime direction is selected with known tradeoffs and constraints.

### T12. Implement side-panel-independent runtime foundations

- Type: Implementation
- Why now: This is the first large architectural change and should happen only after context and event needs are clearer.
- Deliverable: The smallest foundational change needed to preserve runtime state outside the side panel.
- Exit criteria: Closing the side panel no longer destroys the essential live session behavior targeted by the chosen design.

### T13. Harden the interaction loop

- Type: Implementation
- Why now: Once the core runtime shape is stable, we can improve reliability rather than guessing around unstable behavior.
- Deliverable: Focused improvements to:
  - barge-in and interruption policy
  - noise handling
  - session persistence depth
  - debugging and observability
- Exit criteria: The system behaves more predictably under real usage and provides enough traceability to diagnose failures.
- Status: Complete. See `T13_INTERACTION_LOOP_HARDENING.md`.

### T14. Run structured user testing

- Type: Evaluation
- Why now: At this point we should have a coherent enough experience to test with target users instead of shifting prototypes.
- Deliverable: A compact test report from structured sessions with representative users or proxies.
- Exit criteria: We have evidence about whether the interaction model is genuinely helping and what the next product priorities should be.
- Status: Skipped for now due project time constraints. Keep `T14_STRUCTURED_USER_TESTING_PLAN.md` as a future-ready plan.

### T15. Apply selective maintainability improvements

- Type: Implementation
- Why now: Maintainability work should follow proven value areas rather than lead them.
- Deliverable: Targeted cleanup such as:
  - TypeScript migration for high-churn modules
  - stricter protocol schemas
  - validation and test improvements
- Exit criteria: The highest-risk parts of the codebase become easier to evolve safely.
- Status: Complete for the selected protocol-validation-focused slice. See `T15_SELECTIVE_MAINTAINABILITY_IMPROVEMENTS.md`.

### T16. Redesign the extension UI

- Type: Implementation
- Why now: UI redesign should follow architectural and interaction stability, not precede it.
- Deliverable: A redesign plan and implementation aligned with the settled runtime and user flows.
- Exit criteria: The interface reflects the product we actually decided to build, rather than an earlier prototype.
- Status: Complete. See `T16_REDESIGN_EXTENSION_UI.md`.

## Current sequencing rule

The intended loop is:

1. research
2. decide
3. implement one narrow slice
4. evaluate
5. reorder the remaining backlog if needed

This file should be updated whenever a completed item changes the order or scope of later work.
