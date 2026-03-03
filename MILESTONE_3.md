### 🤖 Prompt for the Coding Agent: Milestone 3

**Role:** Senior Full-Stack Engineer / Computer Vision Specialist

**Context:** Milestone 2 (Audio & Interruption) is complete and verified. Now, we are implementing **Milestone 3: The Vision Loop**. We need to give KindlyClick the ability to "see" the user's screen in real-time.

**Objectives:**
 1. **Tab Capture Logic:** In the Chrome Extension, implement a loop that captures the current active tab. Use `chrome.tabCapture` or `getDisplayMedia`.
2. **Frame Optimization:** To maintain low latency, capture frames at **1 FPS**. Each frame must be drawn to a hidden canvas, resized to **720p**, and converted to a **Base64-encoded JPEG** (Quality: 0.6).
3. **Real-time Streaming:** Send these image strings through the existing WebSocket to the backend. The backend must handle these as `realtime_input` for the Gemini Live API.
4. **ADK Integration:** Update the ADK `Runner` configuration to process interleaved audio and video chunks. Ensure the system prompt is updated to acknowledge it has "eyes" (e.g., "You can see the user's screen; use this to guide them").

**The Test Harness Update (CRITICAL):**
Update `tests/harness.js` to include a **Vision Simulation**:
 * Create a function that sends a sequence of 3 static images (e.g., a "Sign In" page, a "Dashboard," and a "Settings" page) to the backend.
* Add a test case where the harness asks: "What do you see?" and asserts that the Gemini response (mocked or live) identifies key elements from those images.
 

**Constraint Reminder:**
 * You are cleared to refactor the WebSocket protocol to handle binary/text multiplexing if needed.
 * **NO `gcloud` commands** without my explicit approval.

 **Deliverable:** Update the Extension's background/content scripts for the capture loop and the Backend's ADK ingestion logic.

---

### 💡 Why 1 Frame Per Second (1 FPS)?

In a live navigation scenario for seniors, the screen doesn't change rapidly (like a video game). 1 FPS is the "sweet spot" for several reasons:

* **API Limits:** Gemini Live is optimized for high-reasoning, not high-framerate. 1 FPS is plenty for it to see a button or a menu.
* **Bandwidth:** It keeps the data usage low, which is vital for the "low-latency" feel required for the hackathon.
* **Battery/CPU:** It prevents the senior's computer from slowing down while the extension is running.