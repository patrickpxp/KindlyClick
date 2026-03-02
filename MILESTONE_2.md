**Milestone 2** is the most critical for your specific hackathon track because it tackles **Natural Interaction** and **Interruption Handling (Barge-in)**, which accounts for a massive chunk of the judging criteria.

### 🎯 Milestone 2: The "Bidi-Stream" (Audio & VAD)

The goal is to get KindlyClick talking and listening. We want the agent to stop speaking the moment it detects Arthur's voice.

---

### 🤖 Prompt for the Coding Agent: Milestone 2

**Role:** Senior Full-Stack Engineer / AI Specialist
**Context:** Milestone 1 is complete. We have the project structure, Terraform, and Firestore session management. We are now moving to **Milestone 2: Bi-directional Audio & Interruption Handling**.
**Objectives:**
1. **Frontend (Extension):** Implement the `AudioWorklet` or `ScriptProcessor` to capture 16kHz Mono PCM audio from the user's microphone.
2. **Backend (ADK):** Configure the Gemini Live API connection to use **Native Voice Activity Detection (VAD)**.
3. **The Loop:** Ensure audio chunks are sent via WebSocket to the backend, and the backend streams Gemini's response audio back to the extension for playback.
4. **Interruption Logic:** Implement the "Barge-in" feature. When the Gemini Live API detects user speech, the backend must send a "STOP_AUDIO" or "CLEAR_BUFFER" signal to the extension to immediately halt current playback.


**The Test Harness (CRITICAL):**
Update `tests/harness.js` to include:
* **Audio Injection:** A function that streams a sample `.wav` file (simulating Arthur speaking) to the backend.
* **Interruption Test:** A scenario where the script sends a second audio chunk *while* the backend is still sending response audio. Verify that the response stream is cancelled/truncated.


**Constraint Reminder:** You may write and refactor all code. However, you MUST ask for my explicit approval before running any `gcloud` commands or deploying to Cloud Run.
**Deliverable:** Please provide the updated backend logic for the ADK audio loop and the extension's audio capture script.

---

### Why this Milestone matters for the Judges:

1. **Low Latency:** By using PCM (Pulse Code Modulation) over WebSockets, you ensure there is no "lag" that would confuse a senior user.
2. **Native VAD:** Using the Gemini Live API's built-in VAD is much more sophisticated than simple volume thresholds; it can distinguish between background noise and Arthur actually speaking.
3. **Human-Centric Design:** This milestone proves the "Kindly" part of **KindlyClick**—an agent that listens and stops talking when the human needs to speak is the hallmark of a high-quality "Live Agent."

**Once the agent provides the code for Milestone 2, you can run the updated Test Harness to hear the "conversation" for the first time! Ready to send it?**