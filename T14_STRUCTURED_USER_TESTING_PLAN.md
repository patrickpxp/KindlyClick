# T14 Evaluation Plan: Structured User Testing

Updated on March 16, 2026.

## Status

This plan was prepared, but T14 was explicitly skipped for now because of project time constraints.

Keep this file as a future-ready testing package rather than the current active work item.

## Purpose

This note turns T14 in `SEQUENTIAL_AGENT_TODO.md` into an executable test plan.

The goal is to answer one product question:

- is KindlyClick materially helpful for real users or reasonable proxies during guided browser tasks?

This plan is intentionally compact. It is designed for early validation, not formal research.

## Success criteria for T14

T14 should be considered complete when we have:

- at least 3 structured sessions with target users or close proxies
- the same core task set run in each session
- scores and notes recorded in a consistent format
- a short conclusion about:
  - whether the interaction model is genuinely helpful
  - what the biggest blockers are
  - what the next product priorities should be

## Participant profile

Preferred participants:

- seniors with low confidence using modern websites

Acceptable early proxies:

- adults who are not technically confident
- adults role-playing the senior-use case while following the same script

Avoid:

- engineers who already know the product internals
- testers who already know the exact target pages and tasks by memory

## Recommended sample size

Minimum useful pass:

- 3 sessions

Better first pass:

- 5 sessions

Suggested mix:

- 2 users with genuinely low digital confidence if available
- 1 to 3 proxy users if real target users are hard to recruit immediately

## Test environment

Use one stable local setup for all sessions:

- Chrome with the unpacked KindlyClick extension
- backend running in real Gemini Live mode
- microphone working
- screen/tab sharing enabled
- client log relay enabled

Before each session:

1. Reload the extension.
2. Start the backend in real Gemini Live mode.
3. Open the side panel and connect.
4. Verify mic works.
5. Verify vision works with `What do you see?`.

## Session rules

The moderator should:

- read the task prompt exactly as written
- avoid rescuing the user too early
- intervene only if the session gets stuck or unsafe
- note whether the user relied on the assistant successfully, not whether the moderator could have solved it faster

The user should:

- speak naturally
- interrupt naturally if needed
- try to follow the assistant without hidden coaching

## Core task set

Use the same six tasks in each session.

These tasks are grounded in `T3_PROVISIONAL_EVALUATION_MATRIX.md`.

### Task 1. Screen orientation

Goal:

- verify whether the assistant can describe the current page clearly

Prompt:

- `What do you see?`

Pass indicators:

- identifies the current page or state correctly
- mentions the most relevant landmarks
- avoids hallucinating controls

### Task 2. Find a visible control

Goal:

- verify whether the assistant can point the user to a specific visible target

Prompt examples:

- `Where is the sign in button?`
- `Where is the search bar?`

Pass indicators:

- identifies the right target
- uses actionable spatial language
- highlight helps rather than confuses

### Task 3. Focus-aware form guidance

Goal:

- verify whether the assistant understands the current interaction point

Prompt examples:

- `What field am I in?`
- `What should I type here next?`

Pass indicators:

- correctly identifies the focused field or control
- gives one clear next step
- does not expose sensitive content unnecessarily

### Task 4. Post-click state change

Goal:

- verify whether the assistant stays synchronized after a user action

Prompt:

- `Did that work? What changed?`

Pass indicators:

- notices the relevant state change
- describes success, failure, or ambiguity clearly
- does not answer from stale screen state

### Task 5. Temporary loss of vision

Goal:

- verify graceful degradation when the screen feed is unavailable

Prompt:

- stop vision capture, then ask `What do you see?`

Pass indicators:

- clearly says it cannot currently see the screen
- does not fabricate an answer
- gives the minimal corrective next step

### Task 6. Interruption / barge-in

Goal:

- verify whether live turn-taking feels usable

Procedure:

- ask a question that produces a spoken answer
- interrupt naturally while the assistant is speaking

Pass indicators:

- assistant stops reasonably quickly
- it does not keep talking over the user in an unacceptable way
- the follow-up response remains relevant

## Scoring rubric

Use the same 0-2 scale from T3 for each task and each dimension.

Dimensions:

- task success
- grounding quality
- actionability
- safety/privacy
- latency

Scale:

- `0` = failed or clearly poor
- `1` = mixed / partially useful
- `2` = correct and useful

Maximum score per task:

- `10`

Maximum score per session:

- `60`

## Qualitative notes to capture

For every task, record:

- what the user said
- what the assistant said or did
- whether the user looked confident, confused, or frustrated
- whether interruption timing felt acceptable
- whether highlight helped
- whether the user trusted the answer

Also record at session level:

- user confidence before session
- user confidence after session
- whether they would want to use this again

## Required artifacts

For each session, capture:

- participant code or alias
- date and tester/moderator name
- backend mode: real Gemini Live
- target website or fixture used
- notable assistant responses
- notable failures or recoveries
- relevant client-log or backend-log snippets when something goes wrong

If possible also capture:

- screen recording
- backend log excerpt
- any highlight misplacement example

## Suggested session structure

Recommended duration:

- 20 to 30 minutes per participant

Suggested flow:

1. 2 minutes: intro and consent
2. 3 minutes: explain that the assistant can hear and see the browser
3. 15 to 20 minutes: run the six core tasks
4. 3 to 5 minutes: short debrief

## Debrief questions

Ask all participants:

1. What was most helpful?
2. What felt confusing or frustrating?
3. Did the assistant speak too much, too little, or about right?
4. Did interruptions feel acceptable?
5. Did you trust where it told you to click?
6. Would you use this for a real browser task?

## Report template

Use the following structure for the final T14 result.

### Session summary

- Date:
- Moderator:
- Participant code:
- Participant type: target user / proxy
- Browser task context:

### Task scores

| Task | Success | Grounding | Actionability | Safety | Latency | Total |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Screen orientation |  |  |  |  |  |  |
| 2. Find visible control |  |  |  |  |  |  |
| 3. Focus-aware guidance |  |  |  |  |  |  |
| 4. Post-click change |  |  |  |  |  |  |
| 5. Vision unavailable |  |  |  |  |  |  |
| 6. Barge-in |  |  |  |  |  |  |

### Key observations

- What worked:
- What failed:
- Where the user hesitated:
- Whether highlight helped:
- Whether interruption felt acceptable:

### Evidence

- Relevant assistant outputs:
- Relevant log snippets:
- Any screenshots or recordings:

### Recommendation

- Keep as-is:
- Fix next:
- Defer:

## Expected T14 deliverable

At the end of T14, produce one compact report summarizing:

- participant count and profile
- aggregate scores by task
- highest-confidence strengths
- most important blockers
- recommended next backlog priorities
