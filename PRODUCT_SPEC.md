# Project Overview: KindlyClick Live Agent

## 1. The Vision

**KindlyClick** is a real-time, multimodal AI companion designed to bridge the digital divide for senior citizens. Unlike traditional chatbots, KindlyClick "sees" the user's screen through a Chrome Extension and "talks" to them through a natural, interruptible voice interface. It acts as a digital pair-navigator, helping non-computer-literate users perform tasks like sending emails, identifying buttons, or navigating complex websites without the frustration of "where do I click?"

## 2. The Core Problem

Seniors often struggle with:

* **Visual Noise:** Differentiating between ads, pop-ups, and actual navigation buttons.
* **Abstract UI:** Not understanding modern iconography (e.g., hamburger menus or "kebab" dots).
* **Feedback Loops:** Not knowing if a click worked or if the page is simply loading.

## 3. Mandatory Hackathon Constraints (Track: Live Agents)

* **Real-time Multimodal:** Must handle simultaneous Audio/Vision input via the **Gemini Live API**.
* **Graceful Interruption:** Must use native Voice Activity Detection (VAD) to stop talking immediately when the user speaks (**Barge-in**).
* **Google Cloud Native:** Backend hosted on **Cloud Run**, session state in **Firestore**, infrastructure via **Terraform**.
* **SDK:** Built using the **Google Agent Development Kit (ADK)**.

## 4. Technical Architecture

* **The "Eyes" (Vision):** Chrome Extension captures the active tab via `getDisplayMedia` or `tabCapture` at ~1 FPS.
* **The "Ears/Voice" (Audio):** Bi-directional PCM audio stream via WebSockets.
* **The "Hands" (Tool Use):** A specific tool `draw_highlight(x, y)` that injects a pulsing visual "laser pointer" directly into the user's active webpage via a Content Script.
* **The "Brain" (Backend):** A Node.js service on Cloud Run that orchestrates the Gemini Live session.

## 5. Persona & UX Principles

* **The Kindly Guide:** The agent's tone is patient, warm, and encouraging.
* **Step-by-Step:** Instructions are given one at a time. The agent waits for visual confirmation of a click before moving to the next step.
* **Spatial Clarity:** Uses the Vision feed to describe locations ("The big blue button on the left") rather than technical terms ("The primary CTA").

## 6. Development Philosophy

* **Test-Harness Driven:** Every milestone includes a mock-based test suite in the `tests/` folder to simulate extension traffic.
* **Modular Milestones:** Development follows a strict 5-milestone roadmap (Infra -> Audio -> Vision -> Tools -> Persona).
* **Approval-Based:** The agent must ask for permission before executing `gcloud` commands.