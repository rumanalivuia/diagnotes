# Workflow & communication
- Prefers fanning out large, multi-part requests to parallel subagents rather than handling everything serially in one pass (e.g., explicitly ending a big task brief with "fan out subagent"). Confidence: 0.8
- Prefers driving complex work through the harness's slash commands and specialized skills (/ultragoal, /security-review, /graphify, /init, ui-theme-designer) instead of free-form prompting. Confidence: 0.7
- Communicates as terse, imperative one-liners that pack a long checklist of requirements into a single command message. Confidence: 0.7
- Prefers autonomous end-to-end execution: investigate → fix → test → commit → deploy → verify, without pausing for intermediate approval. Says "continue" or "now commit" to push through. Confidence: 0.8
- Values end-to-end verification over unit tests alone — expects e2e smoke tests, production builds, and live deployment checks as standard. Confidence: 0.7
- Wants full (not piecemeal) design passes: "use /design skill and review the project then /plan for improvement with deep qa interview of me". Confidence: 0.8
- Delegates feature ideation to the assistant — says things like "elements we should add" and expects the AI to propose what features to build, not just implement specified requirements. Confidence: 0.7
