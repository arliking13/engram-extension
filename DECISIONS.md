# Decisions

This file records durable decisions for Engram. Update it when an agent makes or changes a technical/product decision. Do not use it as a running changelog; use `STATUS.md` for that.

## Active Decisions

### MVP platform is Claude.ai

Claude.ai is the first supported platform for the MVP and demo. Other platforms stay stubbed or secondary until the Claude.ai parse-store-health-handoff flow works end to end.

Rationale: The README and Claude project context both identify Claude.ai as the MVP path.

### MVP scope is parser, storage, popup health, handoff export

The MVP should stay centered on:

- Claude.ai DOM parser.
- Project-isolated storage.
- Popup context health score.
- Handoff export/continuation prompt.

Rationale: These pieces directly support the product promise: "Keep the thread. Never lose context."

### Browser extension architecture remains Manifest V3

Keep the extension structure around MV3 content scripts, background service worker, storage, platform parsers, and popup UI.

Rationale: Existing source layout and README are already organized around this architecture.

### Storage is project-isolated

Captured data should be isolated by project id. Global data should be limited to settings/templates or other intentionally shared state.

Rationale: Project isolation is listed as a core principle in the existing project context.

### Handoff generation happens on demand

Handoff generation should occur when the user requests it, not continuously in the background.

Rationale: Existing context says handoff should be one AI/API call on button press, reducing cost and complexity.

### Avoid large uncontrolled refactors

Agents must not rewrite the app or perform broad refactors while implementing MVP tasks.

Rationale: The project is in hackathon MVP mode; continuity and demo reliability matter more than architectural churn.

### Job Search workflow is a lightweight additive layer, not a pivot

Engram remains an AI chat continuity tool ("Keep the thread. Never lose context."). The Job Search feature is a thin layer on top: LinkedIn job page → Engram widget detects job → user copies AI analysis prompt → user analyzes in Claude/GPT/Gemini → (future) Engram captures that AI session for continuity handoff.

Rationale: Hackathon theme is identifying high-quality remote job opportunities. Aligning via the workflow layer avoids disrupting the MVP and avoids a full product pivot.

Constraints: No full AI job analysis in the extension. No Vercel job analysis calls. No external API calls from the job skeleton. All job data stored locally.

### Job data stored in browser.storage.local, not IndexedDB

Saved jobs go into `browser.storage.local` under key `engramSavedJobs` (array). Session/health/handoff data stays in IndexedDB via the existing `Storage` class.

Rationale: Keeps job storage simple and separate from chat session storage. IndexedDB schema does not need versioning or migration for the skeleton.

## Candidate Or Historical Decisions To Revisit Later

- Gemini parser and Gemini API integration are not current MVP priorities unless needed for demo requirements.
- Gemini 1.5 Flash was previously noted as a possible handoff-generation model; verify current API/model availability before implementing.
- `extension/storage/storage.js` may be legacy if storage logic has moved into `background/worker.js`; confirm before deleting or rewriting anything.
