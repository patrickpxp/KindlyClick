# T8 Research: Browser Event Streaming

Updated on March 16, 2026.

## Purpose

This note answers T8 in `SEQUENTIAL_AGENT_TODO.md`:

- which user/browser events are likely worth sending
- whether raw events or higher-level summaries are better
- what cadence and retention policy make sense
- what event volume or prompt-bloat risks exist

## Executive summary

Event streaming is promising only if it fills a gap that the current frame plus compact metadata cannot already cover.

After T6-T7, the main remaining gap is not “what is focused right now.” It is “what just changed?” and “did the user’s action cause a transition?”

That means the best first event subset is:

- top-level navigation transitions

Not:

- raw clicks
- raw scroll events
- mutation streams
- full focus-change streams

## What events are likely worth sending

### Highest-value candidates

#### 1. Top-level navigation transitions

Examples:

- new document committed
- same-document route change
- page load completed
- navigation failed or was aborted

Why they matter:

- they directly answer the user’s “did that work?” moment
- they are low-volume
- they are relatively easy to summarize
- they complement the current frame metadata instead of duplicating it

Likely capture surface:

- background script with `tabs.onUpdated`
- possibly `webNavigation` if finer navigation semantics are needed

#### 2. Focus changes on actionable controls

Examples:

- focus moved to search field
- focus moved to password field
- focus moved to compose button

Why they matter:

- useful if focus changes between frame samples
- helpful for keyboard-driven flows

Why they are not first:

- the current focused-element metadata already covers the present state
- an event stream adds more value only when transition timing matters

Likely capture surface:

- content script listeners for `focusin`

#### 3. Clicks on actionable controls

Examples:

- clicked visible button/link
- clicked control with known label or role

Why they matter:

- can help correlate user intent with later state change

Why they are not first:

- privacy risk is higher than navigation transitions
- many clicks do not matter
- raw click capture can get noisy quickly

Likely capture surface:

- content script listeners for `click`

### Low-priority or poor candidates

#### Raw scroll events

- high volume
- mostly redundant once current viewport/scroll state is already captured
- better represented as current state than as an event log

#### Pointer move / hover

- almost pure noise for this product

#### DOM mutation streams

- too noisy
- expensive
- difficult to summarize coherently

#### Keyboard event streaming

- high privacy risk
- not appropriate by default

## Raw events vs higher-level summaries

Higher-level summaries are clearly better for this product.

Recommended principle:

- capture raw browser/page events locally
- immediately reduce them into sparse semantic summaries before sending anything to the backend/model

Good summary examples:

- `navigated to Gmail Inbox`
- `same-page route changed to Settings`
- `page finished loading`
- `focus moved to Search mail searchbox`
- `clicked Compose button`

Bad raw examples:

- every `focusin`
- every `click`
- every `scroll`
- every history mutation

Reason:

- Gemini Live should receive context that is already filtered for relevance
- otherwise event streaming becomes prompt bloat, not grounding

## Cadence and retention policy

### Cadence

For the first event experiment, event delivery should be event-driven, not polled.

Recommended cadence:

- send only on meaningful transition
- no heartbeat
- no batch flush unless events happen in quick succession and need local coalescing

Coalescing guidance:

- navigation: send one summary at commit and optionally one at completion
- focus: suppress duplicates if the same target stays focused
- click: suppress repeated clicks on the same target within a short window such as 500-1000ms

### Retention

Keep only a tiny recent history.

Recommended retention for model-visible event summaries:

- last 3-5 event summaries max
- time window around 15-30 seconds

Recommended retention for local debug logs:

- longer is acceptable locally, but that is for traceability, not for model context

Reason:

- the agent needs recent causality, not a full interaction trace

## Event volume and prompt-bloat risks

### Main risks

- too many events compete with the user’s actual spoken request
- repeated focus/click events can bury the meaningful transition
- event summaries can become stale if not expired aggressively
- richer event text increases privacy surface area

### Specific privacy risks

- clicks inside personal communication tools can reveal workflow context
- focus changes can reveal that the user is in a sensitive field
- keyboard/input events are especially risky and should stay excluded

### Mitigation

- send only semantic summaries
- redact or generalize sensitive controls
- keep retention very short
- prefer navigation events over content-heavy interaction events

## Chrome MV3 implementation implications

What the current repo already supports:

- content-script extraction on active pages
- background-script messaging
- existing frame metadata transport

What would likely be needed for the first event experiment:

- a new narrow message path for event summaries from content/background to the side panel or backend
- possibly additional extension permission if `webNavigation` is used
- strict deduplication and bounded retention in the extension before anything reaches the model

Important constraint:

- because the side panel is still the active runtime host, event streaming should remain narrow and reversible
- do not build a complex stateful event subsystem before the runtime architecture work in T11-T12

## Recommendation for the first event subset

The smallest worthwhile event subset to try first is:

- top-level navigation transitions

Concretely:

- page navigation committed
- same-document route change when detectable
- page load completed

Why this is the best T9 candidate:

- lowest volume
- strongest value for “did that work?” and synchronization
- lower privacy risk than click streams
- complements the first context slice rather than overlapping with it

## Secondary candidate after navigation

If navigation summaries help, the next event subset to consider would be:

- focus changes on actionable controls

But only as summarized transitions, not as a raw event stream.

## Exit criteria check

T8 requires:

- which user/browser events are likely worth sending
- whether raw events or higher-level summaries are better
- what cadence and retention policy make sense
- what event volume or prompt-bloat risks exist

This note answers each of those and recommends the smallest first subset for T9:

- navigation transitions

## Sources

Primary references used for this note:

- Chrome Extensions content scripts: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Chrome Extensions `tabs` API: https://developer.chrome.com/docs/extensions/reference/api/tabs
- Chrome Extensions `webNavigation` API: https://developer.chrome.com/docs/extensions/reference/api/webNavigation
- Chrome Extensions user privacy guidance: https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy
