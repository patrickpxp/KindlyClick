ask codex to write a technical description of the app i can give to Gemini - so i can discuss properly the ROADMAP_v2

get a grasp of this codebase, once you have a good understanding, i will give you some tasks.

<need to rewrite properly and orderly the below>



- would giving the agent more context be helpful ? like tab name, language , page meta ..or the whole page ? whatever the browser extension can give us
- stream browser actions ? like when tab is changed, click or scroll is used ? anything that can help the agent to catch up ? i am always worried it would not be fast enough
- highglighter : let the user customize it by voice : size, color.
- barge in : we are discussing the implementation in ISSUE_BARGE-IN_0001.md but beyond that i am worried about ...
- ...small noises or people interrupting when they talk to themselves ( i remember jeanlou talking to me while i was talking to chatgpt voice). what can we do ? we could let it finish small phrases ? let agent determine if that sounds like voice directed to him ? determine if noise was voice or noise and act accordingly ?
- CAN WE DO WITHOUT SIDEPANEL ? rn when i close panel, the whole thing stops
- USER TESTING ! IS THIS THING REALLY GOOD ?
- use typescript ? less ambiguity because types ?
- use more gcp resources ? logging ? ai gateway / admin dashboard ?
- redo frontend of browser extension with Gemini 3.1 Pro in Gemini CLI (Matt Berman says gpt 5.4 sucks at design/frontend)