# Engram — AI Chat Continuity Extension

> Keep the thread. Never lose context.

Engram is a Firefox browser extension that helps preserve context from long AI-assisted work sessions and move that work into a new chat when the original conversation becomes too heavy, unstable, or difficult to continue.

It scans supported AI chat pages, tracks conversation health, exports structured context, and generates handoff packages that can be pasted into a fresh AI session.

For the hackathon build, Engram also includes a lightweight LinkedIn Job Prompt Bridge: it detects job details from LinkedIn job pages and turns them into a structured AI analysis prompt for evaluating legitimacy, red flags, remote-work quality, salary transparency, and applicant fit.

---

## Problem

AI tools are powerful for long technical workflows, but long chats often become harder to continue over time.

Common issues:

- the model loses track of earlier decisions
- important project context gets buried
- generated files, code changes, and reasoning become scattered
- users need to start a new chat but do not have a clean handoff
- job-search workflows require repeatedly copying job descriptions into AI tools manually

Engram is designed as a continuity layer for this kind of AI-assisted work.

---

## Solution

Engram helps users capture, preserve, and transfer work context.

Core workflow:

1. Open a supported AI chat.
2. Use Engram to scan the conversation.
3. Review conversation health and captured content.
4. Export the session or generate a structured handoff.
5. Paste the handoff into a new AI chat and continue the work.

Hackathon job workflow:

1. Open a LinkedIn job page.
2. Engram detects the job title, company, location, work mode, and description.
3. Click **Copy AI Prompt**.
4. Paste the prompt into Claude, ChatGPT, Gemini, or another AI assistant.
5. The AI evaluates the job posting using a structured checklist.

---

## Key Features

### AI Chat Continuity

- scans long AI chat sessions
- captures messages and context
- tracks conversation health
- exports session content
- generates handoff prompts for continuing work in a new chat

### LinkedIn Job Prompt Bridge

- detects LinkedIn job pages
- extracts structured job details
- identifies work mode: remote, hybrid, or onsite
- copies a structured job-analysis prompt
- keeps the product focused on AI workflow continuity rather than becoming a full job board or verifier

### Demo and Self-Hosted AI Settings

Engram is designed around two modes:

- **Demo Mode** — extension calls a hosted backend endpoint for handoff generation.
- **Self-hosted / Custom Mode** — users can point Engram to their own backend endpoint.

API keys are intended to live server-side in backend environment variables, not hardcoded inside the extension.

---

## Supported Platforms

| Platform | Status |
|---|---|
| Claude.ai | MVP working |
| LinkedIn Jobs | MVP working |
| Gemini | Experimental / stub |

---

## Project Structure

```text
extension/
  manifest.json
  background/
    worker.js
  platforms/
    claude/
      parser.js
    gemini/
      parser.js
    jobs/
      job-detector.js
      linkedin-parser.js
      job-widget.js
  popup/
    popup.html
    popup.css
    popup.js
  options/
    options.html
    options.js
  storage/
    storage.js