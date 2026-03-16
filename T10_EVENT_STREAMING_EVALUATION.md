# T10 Evaluation: Event Streaming and Contract Revisions

Updated on March 16, 2026.

## Scope

This note answers T10 in `SEQUENTIAL_AGENT_TODO.md`:

- whether event streaming improved assistant synchronization or quality
- whether prompt framing or tool contracts should change
- whether highlight commands need better anchoring semantics than raw coordinates

The evaluation uses:

- the navigation-event experiment from `T9_NAVIGATION_EVENT_EXPERIMENT.md`
- mock-harness evidence from `tests/artifacts/context_eval.json`
- manual highlight feedback from real testing on March 16, 2026

## Did event streaming help?

Yes, in a narrow but real way.

### Navigation-summary comparison

Prompt:

- `Did that work? What changed?`

Baseline:

- no recent navigation events
- page title and visible headings unchanged

Observed baseline response:

- `I can see the current screen, but I do not detect a strong page-state change from the recent frames.`

Enriched case:

- same visual/title context
- recent navigation summaries added to metadata

Observed enriched response:

- `Yes, there was a recent navigation update: completed https://mail.google.com/mail/u/0/#sent (Sent).`

Interpretation:

- navigation summaries improved synchronization when the visual state alone was ambiguous
- this is the right shape of value for event streaming
- it supports expanding event work cautiously, but only with similarly sparse summaries

## Did latency change?

Not meaningfully in mock mode.

Observed mock latencies remained effectively unchanged:

- navigation comparison baseline: `0ms`
- navigation comparison enriched: `0ms`

Interpretation:

- no local latency regression was visible
- mock-mode timings are not strong evidence for production latency
- the useful conclusion is only that the current navigation-summary payload is small enough not to create obvious local overhead

## Prompt framing changes

No major prompt redesign is justified yet.

Current conclusion:

- the navigation experiment works with the existing compact metadata-note approach
- a larger prompt rewrite would be premature before more real-model evaluation

What should remain true:

- event summaries should be framed as recent system context, not as a long activity log
- the prompt should continue to bias the model toward current frames plus a tiny recent-causality window

What changed already and should stay:

- the highlight tool prompt now asks for a short label matching the visible text or purpose of the target element

That change should remain because it materially improves downstream highlight anchoring.

## Tool contract conclusions

### Do highlight commands need better anchoring semantics than raw coordinates?

Yes.

Raw coordinates alone were not reliable enough in real browsing.

Observed manual feedback on March 16, 2026:

- highlight placement was visibly wrong on at least two real pages before the fix
- after adding label-based DOM anchoring, the user reported much better results on:
  - `edition.cnn.com/world` for the `Sign in` button
  - `gmail.com` for the `Compose` button

Conclusion:

- raw coordinates are necessary but insufficient
- the tool contract should continue to prefer:
  - coordinates
  - a short visible label or semantic purpose

This is the right intermediate contract until there is a stronger element-identity mechanism.

### Should highlight anchoring evolve further later?

Probably yes, but not immediately.

Future candidates:

- explicit target text
- target role
- stronger semantic target identifiers when available

For now, label plus coordinates is a good narrow contract.

## Recommendation

Recommendation:

- keep the navigation-summary event slice
- do not expand to raw click or focus streams yet
- keep the label-aware highlight contract
- defer larger prompt changes until more real-model evidence exists

## What to do next

The event-streaming path should only expand if the next experiment shows incremental value similar to the navigation case.

Best next candidate after navigation:

- summarized focus transitions on actionable controls

But only if:

- they improve synchronization beyond the current focused-element snapshot
- they stay bounded and privacy-safe

## Exit criteria check

T10 requires:

- whether event streaming improved assistant synchronization or quality
- whether prompt framing or tool contracts should change
- whether highlight commands need better anchoring semantics than raw coordinates

This note supports:

- navigation summaries improved synchronization in the evaluated case
- no broad prompt redesign is needed yet
- highlight commands do need better anchoring semantics than raw coordinates, and label-aware anchoring should stay
