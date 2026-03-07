### 🤖 Prompt for the Coding Agent: Milestone 4

**Role:** Senior Full-Stack Engineer / UX Specialist
**Context:** Milestone 3 (Vision Loop) is complete. KindlyClick can now "see" the screen at 1 FPS. Now, we are implementing **Milestone 4: The Action (Laser Pointer Tool)**.
**Objectives:**
1. **Define the Tool:** Create a function tool in the ADK backend called `draw_highlight(x, y, label)`.
* **x, y:** Normalized coordinates (0.0 to 1.0) or pixel coordinates representing where the agent wants to point on the user's screen.
 * **label:** A short string (e.g., "Compose Button") that can optionally be displayed near the highlight.
 
2. **Tool Call Orchestration:** Update the Gemini Live session config to include this tool. When the agent decides to point at something, the backend must catch this tool call and relay a "COMMAND" message via the WebSocket to the Chrome Extension.
3. **Frontend Injection (Content Script):** >     - Implement a listener in the Extension's Content Script to receive the `DRAW_HIGHLIGHT` command.
* Create a "Laser Pointer" effect: a pulsing, semi-transparent yellow/red circle that appears at the specified coordinates.
* Ensure the highlight is "non-blocking" (pointer-events: none) so it doesn't interfere with Arthur's actual clicking.
 
4. **Coordinate Mapping:** Ensure that the coordinates Gemini "sees" in the 720p vision frame map correctly to the actual screen dimensions in the browser window.

**The Test Harness Update (CRITICAL):**
Update `tests/harness.js` to include a **Tool Loopback Test**:
* Mock a situation where the agent is asked "Where is the search bar?"
* Verify that the backend sends a JSON payload to the mock client containing the correct `action: "DRAW_HIGHLIGHT"` and valid `x, y` coordinates.
* Verify that the session state in **Firestore** logs that a tool was successfully called.
 
**Constraint Reminder:**
 * Maintain the "Kindly" persona: the agent should say "Let me show you..." as it triggers the highlight.
 * **NO `gcloud` commands** without my explicit approval.
 
**Deliverable:** Provide the ADK tool definition, the updated WebSocket message handler, and the CSS/JS for the "Laser Pointer" injection.

**Shall we hand this over to the coding agent?** Once this is done, you will have a functional, "vision-to-action" prototype ready for the final persona polish!