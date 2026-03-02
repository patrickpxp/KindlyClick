# Issues Pending

## 1) Chrome Extension Microphone Permission Friction (Milestone 2)

- Status: Open
- Severity: High (blocks first-time voice usage)
- Date observed: March 2, 2026
- Area: `extension/sidepanel.html`, `extension/sidepanel.js`

### Summary

The side panel audio flow can fail with:

- `NotAllowedError: Permission dismissed`

even when backend WebSocket/session setup is working.

This introduces onboarding friction and is not acceptable for end users.

### Reproduction (Observed)

1. Load extension and connect to backend WebSocket.
2. Click `Start Mic` directly.
3. Mic permission can fail/dismiss without a clear successful capture path.

### Current Manual Workaround (Confirmed)

1. Open sidepanel origin site settings (`chrome-extension://<extension-id>`).
2. Set microphone permission to `Allow`.
3. Reload extension.
4. Use explicit flow:
   - `Connect`
   - `Request Mic`
   - `Start Mic`

### Impact

- First-time users may assume voice is broken.
- Adds non-obvious setup steps.
- Risky for senior-user onboarding, where friction must be minimized.

### Probable Causes

- User-activation/permission timing edge cases in side panel context.
- Permission prompt dismissal behavior inconsistent with normal webpage tabs.
- Repeated `getUserMedia` calls can worsen prompt state.

### Required Product Fix (Before Production)

1. Zero-confusion first-run mic onboarding in extension UI.
2. Single guided permission step with explicit state feedback.
3. No hidden dependency on manual Chrome site settings.
4. Automatic recovery path if permission is dismissed/blocked.
5. QA coverage across:
   - fresh install
   - dismissed once
   - denied then allowed
   - browser restart

### Acceptance Criteria

- New user can install extension and start voice in <= 2 clicks.
- No DevTools or Chrome settings navigation required.
- Error copy tells user exactly what to do when permission is denied.
