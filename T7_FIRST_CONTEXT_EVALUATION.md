# T7 Evaluation: First Context Slice

Updated on March 16, 2026.

## Scope

This note evaluates the first context slice selected in `T5_FIRST_CONTEXT_CHOICE.md`:

- focused element summary
- page language
- browser UI language
- viewport/scroll metadata

The evaluation uses:

- the updated backend harness
- deterministic mock mode
- artifact output in `tests/artifacts/context_eval.json`

## What was evaluated

### Scenario 1. Focus-aware form guidance

Prompt:

- `What field am I in?`

Before:

- baseline metadata only: title, URL, headings, buttons

After:

- baseline metadata plus focused element, language, and viewport state

Observed result:

- before: `I can see the screen, but I cannot tell which field is focused from the current screen context.`
- after: `You are currently focused in the Search mail input searchbox search.`

Interpretation:

- quality improved materially
- this is the clearest positive signal from the first context slice
- the answer moved from non-actionable to specific and grounded

### Scenario 2. Sensitive focused field

Prompt:

- `What field am I in?`

Metadata:

- focused element marked sensitive
- no field label exposed

Observed result:

- `You are currently focused in a sensitive input field. I can help you move through the page, but I will not repeat the field contents.`

Interpretation:

- privacy guard held in the evaluation path
- the response stayed generic and did not expose a field label or value

### Scenario 3. State change comparison

Prompt:

- `Did that work? What changed?`

Observed result:

- `Yes, the page state changed from Sign In to Dashboard.`

Interpretation:

- the system can express a simple state change in mock evaluation
- this scenario is useful for the matrix, but it is not strong evidence that the first context slice itself improved post-click synchronization, because page-title change was already available before the slice

## Latency observations

Mock-mode latencies from `tests/artifacts/context_eval.json` were effectively unchanged:

- focus comparison baseline: `0ms`
- focus comparison enriched: `0ms`
- sensitive focus: `1ms`
- state change: `0ms`
- vision summary: `1ms`

Interpretation:

- no meaningful latency regression was observed locally
- mock-mode numbers are too small to say much about real Gemini latency
- the relevant conclusion is only that the added metadata and framing did not create obvious local overhead

## Regressions check

Regression checks passed after the change:

- backend harness still passes vision summary, tool loopback, vision stop guard, and barge-in
- extension harness still passes controller-level interruption behavior

Observed regression status:

- no transport regressions observed
- no controller regressions observed
- no privacy regression observed in the sensitive-field mock scenario

## Recommendation

Recommendation: keep the first context slice.

Reason:

- it produced a clear quality gain on the focus-aware guidance scenario
- it did not show a measurable local latency cost
- it did not break existing regression coverage
- the privacy behavior is acceptable for the current narrow scope

## Ambiguities and limits

This evaluation is useful, but incomplete.

Main limits:

- the strongest positive result is in mock mode, not real Gemini Live
- the post-click/state-change scenario is not yet isolating the value of the new slice cleanly
- the current harness still does not produce a full scored matrix across all T3 dimensions
- manual or real-model evaluation is still needed to confirm whether the compact metadata note actually improves Gemini reasoning quality

## Suggested next step

The next best step is:

- run a small real-Gemini evaluation on the focus-aware guidance scenario using the same prompts and artifact capture shape

If real-model evaluation is not available yet, the fallback next step is:

- strengthen the harness artifact so each evaluated answer records the exact metadata note sent into the real Live session path

## Exit criteria check

T7 requires:

- observed quality differences
- observed latency differences
- regressions or ambiguities
- a recommendation to keep, refine, revert, or replace the slice

This evaluation supports:

- keep the slice
- refine the evaluation next with real-model coverage
