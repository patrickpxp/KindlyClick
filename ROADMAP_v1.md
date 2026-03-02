### 🗺️ The Roadmap: Milestone by Milestone

1. **Milestone 1: The "Cloud & Pipe" Foundation**
* **Goal:** Infrastructure-as-Code and basic connectivity.
* **Deliverables:** Terraform scripts for Cloud Run/Firestore, a Node.js ADK backend (skeleton), and a manifest-only Chrome Extension.
* **Test Harness:** A script that mocks a WebSocket client to ensure the backend saves sessions to Firestore.


2. **Milestone 2: The "Bidi-Stream" (Audio & VAD)**
* **Goal:** Bi-directional audio with native interruption.
* **Deliverables:** ADK implementation of the Live API audio loop.
* **Test Harness:** An "Audio Injector" that streams a `.wav` file to the backend and verifies that a simulated "User Interruption" signal correctly halts the agent's output.


3. **Milestone 3: The "Vision Loop" (Snapshots)**
* **Goal:** Extension captures screen frames and backend "sees" them.
* **Deliverables:** 1FPS canvas capture logic in the extension and frame-processing in the ADK.
* **Test Harness:** A "Frame Gallery" test that feeds static images of common websites (Gmail/YouTube) to the agent to see if it identifies buttons correctly.


4. **Milestone 4: The "Action" (Laser Pointer Tool)**
* **Goal:** The `draw_highlight` tool call.
* **Deliverables:** Backend tool definition and Frontend Content Script injection logic.
* **Test Harness:** A "Tool Loopback" test: the agent is told to "Point at the top left," and the harness verifies the Extension receives the correct X/Y coordinates.


5. **Milestone 5: The "Polished Persona"**
* **Goal:** Final System Prompting and UI/UX for seniors.
* **Deliverables:** High-patience prompt and the Side Panel UI.