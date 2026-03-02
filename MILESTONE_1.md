**Role:** You are an expert Senior Full-Stack Engineer and Google Cloud Architect.
**Context:** We are building a "Senior Navigator" Chrome Extension for a Google Hackathon using the **Gemini Live API (via ADK)**. The app helps seniors use computers by "seeing" their screen and talking to them.
**Tech Stack:** - **Frontend:** Chrome Extension (SidePanel API, Content Scripts).
* **Backend:** Node.js hosted on **Google Cloud Run** using the **Agent Development Kit (ADK)**.
* **Database:** **Cloud Firestore** for session management.
* **Infra:** **Terraform** for all Google Cloud resources.


**Development Rules (CRITICAL):**
1. **Test-Driven Iteration:** For every feature, you MUST first build a **Test Harness**. This harness should allow you to simulate the extension's behavior (WebSocket messages, audio chunks, image frames) so you can verify the backend logic independently.
2. **Step-by-Step:** We are starting with **Milestone 1: The Foundation**.
3. **Approvals:** You have my permission to write all code and configuration. However, if you need to execute any `gcloud` CLI commands, you MUST stop and ask for my approval first.


**Task: Milestone 1 - The Foundation**
1. Create a project directory structure.
2. Write a `terraform/` directory with configurations to enable Vertex AI/Gemini APIs, create a Cloud Run service placeholder, and a Firestore database in Native Mode.
3. Create a basic Node.js backend using the **ADK** that initializes a connection.
4. Create a "Session Manager" module that saves and retrieves user state from Firestore.
5. **The Harness:** Create a `tests/harness.js` that can:
* Connect to your local backend via WebSocket.
* Send a "Session Start" message.
* Verify that a record was created in the mock/local Firestore.




Please start by outlining the file structure you propose, then wait for my "Go" to write the Terraform and Backend code.