# T2 Decision: Possible Context Inventory

Updated on March 16, 2026.

## Purpose

This note answers T2 in `SEQUENTIAL_AGENT_TODO.md`: a categorized inventory of candidate context signals for KindlyClick, ranked by likely value, implementation cost, latency/payload impact, and privacy risk.

## Current baseline

Today the extension already attaches lightweight metadata to vision frames:

- `pageTitle`
- `pageUrl`
- `tabId`
- `headingHints`
- `buttonHints`

That metadata already flows end to end through the existing vision-frame transport, so the first context upgrade should fit that same shape unless there is a strong reason to change the protocol.

## Decision rule

Prefer context that is:

- easy to gather at frame time from the active tab
- compact enough to fit inside the existing `metadata` payload
- legible to the model without large prompt changes
- low-risk from a privacy standpoint
- reversible if evaluation shows no gain

Avoid context that is:

- high-volume, continuous, or hard to summarize
- likely to include user-authored or regulated content
- dependent on long-lived side-panel state
- expensive to compute on every frame

## Inventory

### Almost free / low risk

#### 1. Browser UI language

- Signal: `navigator.language` from the extension runtime
- Why it helps: speech/transcription and UI-language disambiguation are cheap wins
- Cost: trivial
- Payload impact: negligible
- Privacy risk: very low
- Likely files: `extension/sidepanel.js`

#### 2. Page language

- Signal: `document.documentElement.lang` with a simple fallback to empty string
- Why it helps: clarifies whether page text is expected to be Spanish, English, etc.
- Cost: trivial
- Payload impact: negligible
- Privacy risk: very low
- Likely files: `extension/content.js`

#### 3. Viewport geometry and scroll state

- Signal: viewport width/height, `scrollX`, `scrollY`, and basic document size
- Why it helps: gives the model a better sense of what part of the page the user is currently seeing
- Cost: low
- Payload impact: small numeric fields
- Privacy risk: low
- Likely files: `extension/content.js`

#### 4. Focused element summary

- Signal: tag name, ARIA role, input type, disabled/read-only state, short accessible label/text, approximate bounds
- Why it helps: likely the single best disambiguator for “where am I?” and “what should I click/type?”
- Cost: low to moderate
- Payload impact: small if aggressively trimmed
- Privacy risk: low if value/text capture is excluded by default
- Likely files: `extension/content.js`
- Guardrail: never send live input values, selected passwords, or masked-field contents

#### 5. Active dialog or modal title

- Signal: visible `dialog` or `role="dialog"` title/label when present
- Why it helps: modal state often explains sudden UI changes the screenshot alone does not localize well
- Cost: low
- Payload impact: small
- Privacy risk: low to moderate depending on page content
- Likely files: `extension/content.js`

#### 6. Active banner or error summary

- Signal: short visible alert/banner text from common roles such as `alert`, `status`, or validation summary areas
- Why it helps: gives the model immediate awareness of “invalid password”, “saved successfully”, etc.
- Cost: low to moderate
- Payload impact: small if tightly truncated
- Privacy risk: moderate because banners can include names or sensitive page content
- Likely files: `extension/content.js`
- Guardrail: keep this opt-in or tightly redacted at first

### Moderate cost / moderate risk

#### 7. Sanitized route summary

- Signal: origin plus short redacted path label instead of full raw URL
- Why it helps: often more useful than a long raw URL, and safer
- Cost: low to moderate because redaction rules must be explicit
- Payload impact: small
- Privacy risk: lower than current raw `pageUrl`, but only if sanitization is done well
- Likely files: `extension/background.js`, `extension/sidepanel.js`
- Note: this may replace existing raw URL capture rather than add a new field

#### 8. Nearby field-label summary for the focused control

- Signal: label text, placeholder, fieldset/section title, and maybe one nearby heading
- Why it helps: improves form guidance when the screenshot or OCR is ambiguous
- Cost: moderate
- Payload impact: small to medium
- Privacy risk: moderate because nearby labels can expose sensitive workflow context
- Likely files: `extension/content.js`

#### 9. Small landmark summary

- Signal: current visible landmarks such as nav, search, main, sidebar, dialog
- Why it helps: helps the model orient the user with spatial language
- Cost: moderate
- Payload impact: small to medium
- Privacy risk: low to moderate
- Likely files: `extension/content.js`

#### 10. Recent navigation transition summary

- Signal: last route/page transition, title change, or same-document navigation event
- Why it helps: improves continuity after a click when the screen changes between sampled frames
- Cost: moderate
- Payload impact: small
- Privacy risk: moderate
- Likely files: `extension/content.js`, possibly `background.js`
- Note: this is event-derived, but still summarized rather than streamed raw

#### 11. Small recent interaction summary

- Signal: last 1-3 meaningful actions, such as focus moved to search field or clicked “Continue”
- Why it helps: can help the agent stay synchronized with the user’s recent intent
- Cost: moderate
- Payload impact: medium unless bounded tightly
- Privacy risk: moderate
- Likely files: `extension/content.js`
- Guardrail: bounded ring buffer only; no raw event stream

#### 12. Selected text when explicitly relevant

- Signal: current user text selection
- Why it helps: useful only when the user is asking about text they just selected
- Cost: moderate
- Payload impact: variable
- Privacy risk: high unless explicitly user-triggered
- Recommendation: keep out of default capture

### Expensive, noisy, or privacy-sensitive

#### 13. Full accessibility-tree snapshots

- Why it is tempting: semantically richer than headings/buttons
- Why it is risky: payload and noise can explode quickly; privacy exposure is much wider
- Recommendation: do not use as a default live signal

#### 14. Full DOM serialization

- Why it is risky: expensive, brittle, and unnecessary for the current evaluation stage
- Recommendation: exclude

#### 15. High-cadence raw browser event streaming

- Examples: all clicks, scrolls, pointer moves, focus changes, mutations
- Why it is risky: noisy, hard for the model to use coherently, and likely to bloat prompt state
- Recommendation: exclude until a tiny event subset is justified by evaluation

#### 16. Full visible-text dumps or OCR-like page text extraction every frame

- Why it is risky: duplicates what the screenshot already provides while increasing privacy and token cost
- Recommendation: exclude

#### 17. Cross-tab or browser-history context

- Why it is risky: weak relevance, high privacy cost
- Recommendation: exclude

#### 18. User-authored content by default

- Examples: email bodies, chat messages, document text, typed form values
- Why it is risky: highest privacy exposure with unclear default benefit
- Recommendation: exclude unless the user explicitly asks for help with that exact content

## Ranked shortlist

If the goal is to find the highest-signal additions that still fit the current architecture, the shortlist is:

1. focused element summary
2. page language + browser UI language
3. viewport geometry + scroll state
4. active dialog title
5. sanitized route summary

This ranking favors signals that explain the current screen state rather than trying to reconstruct a full interaction history.

## Recommended first context slice

The first context slice to test should be:

- focused element summary
- page language
- browser UI language
- viewport width/height plus scroll position

Why this is the best first experiment:

- It fits the existing `metadata` field on `realtime_input`, so no transport redesign is required.
- It is compact and cheap to compute compared with event streaming or DOM dumps.
- It addresses a real weakness in the current payload: the model sees a screenshot and a few headings/buttons, but not what the user is currently interacting with.
- It is easy to evaluate. We should be able to tell quickly whether form guidance, “where am I?”, and “what should I click next?” responses improve.
- It is relatively safe if we exclude field values and redact sensitive control labels when necessary.

## Proposed field shape for the first slice

This is not an implementation spec yet, but it is narrow enough to guide T5/T6:

```json
{
  "browserLanguage": "en-US",
  "pageLanguage": "en",
  "viewport": {
    "width": 1280,
    "height": 720,
    "scrollX": 0,
    "scrollY": 540
  },
  "focusedElement": {
    "tag": "input",
    "role": "searchbox",
    "type": "text",
    "label": "Search mail",
    "disabled": false,
    "readOnly": false,
    "bounds": {
      "x": 612,
      "y": 84,
      "width": 420,
      "height": 36
    }
  }
}
```

## What should wait until later

- event streaming of navigation/focus/clicks
- richer accessibility summaries beyond the focused element and nearby labels
- any text-heavy capture path
- any broader runtime work to survive side-panel closure

Those items are not rejected forever. They are just weaker first experiments than compact present-state signals.

## Repo-specific implementation implication

The current transport already supports `metadata` on vision frames in:

- `extension/src/audioController.js`
- `backend/src/server.js`
- `backend/src/adk/geminiLiveSession.js`

That means the first context-slice implementation can stay narrow:

- enrich `getActiveTabMetadata()` in `extension/sidepanel.js`
- expand content-script extraction in `extension/content.js`
- avoid backend protocol changes unless evaluation later proves the model needs structured prompt framing beyond the raw metadata object

## Exit criteria check

T2 requires a ranked inventory and a recommendation for the first signal to test. This note provides both, and the recommended first experiment is:

- focused element summary + language + viewport/scroll metadata
