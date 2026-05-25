# Engram — AI Chat Continuity Extension

Keep the thread. Never lose context.

Engram is a Firefox browser extension that helps preserve context from long AI-assisted work sessions and move work into a new chat when the original conversation becomes too heavy, unstable, or difficult to continue.

It is designed for developers, students, builders, hackathon participants, and anyone who uses AI chats for long technical workflows.

---

## Quick Install on Firefox

This is the fastest way to test Engram locally in Firefox.

### 1. Clone the repository

~~~bash
git clone https://github.com/arliking13/engram-extension.git
cd engram-extension
~~~

### 2. Open Firefox temporary extensions page

Open this page in Firefox:

~~~text
about:debugging#/runtime/this-firefox
~~~

Or manually go to:

~~~text
about:debugging
→ This Firefox
~~~

### 3. Load Engram

Click:

~~~text
Load Temporary Add-on
~~~

Then select:

~~~text
extension/manifest.json
~~~

Engram should now appear in the Firefox toolbar.

### 4. Test the extension

Open one of the supported pages:

~~~text
https://chatgpt.com/
https://claude.ai/
https://www.linkedin.com/jobs/
~~~

Then open the Engram popup and run a scan.

---

## Important Firefox Note

This is a temporary Firefox installation.

If you restart Firefox, the extension may disappear. Load it again through:

~~~text
about:debugging#/runtime/this-firefox
~~~

During development, after changing extension files, use the `Reload` button on the same Firefox debugging page.

---

## What Engram Does

Engram has two main product layers.

### 1. AI Chat Continuity

Supported AI platforms:

| Platform | Status |
|---|---|
| ChatGPT | Working / in development |
| Claude.ai | Working / in development |

Core features:

- scan long AI chat sessions
- count user and assistant messages
- detect chat health
- preserve useful context
- generate handoff / migration packages
- continue work in a new AI chat with less context loss

### 2. Job Context Continuity

Supported job sources:

| Source | Status |
|---|---|
| LinkedIn Jobs | Working / in development |

Core features:

- detect LinkedIn job pages
- extract structured job details
- save job context
- prepare AI-ready job application context
- keep job search work connected to AI workflows

LinkedIn Jobs is treated as a job source, not as an AI platform.

---

## Current Status

Engram is currently in active development.

Current checkpoint includes:

- improved active scan session handling
- ChatGPT scan support
- Claude.ai scan support
- LinkedIn Jobs context support
- handoff / migration package generation
- cleaner export formatting
- Firefox temporary extension loading support

Known remaining work:

- improve migration package validation
- stabilize fresh export scan behavior
- polish product UI
- prepare a packaged release build

---

## Project Structure

~~~text
extension/
  manifest.json
  background/
  popup/
  platforms/
    chatgpt/
    claude/
    jobs/
  storage/
  utils/

site/
  public/
  app/
~~~

The Firefox extension is loaded from:

~~~text
extension/manifest.json
~~~

---

## Development Workflow

After editing extension files:

1. Open Firefox.
2. Go to:

~~~text
about:debugging#/runtime/this-firefox
~~~

3. Find Engram.
4. Click `Reload`.
5. Reopen the Engram popup and test again.

---

## Demo / Self-Hosted AI Settings

Engram is designed so AI API keys are not hardcoded into the browser extension.

Recommended architecture:

~~~text
browser extension
→ backend API route
→ AI provider API
~~~

For demo mode, the backend endpoint should keep API keys server-side.

For custom or self-hosted use, users should be able to deploy their own backend and connect Engram to that endpoint.

---

## License

This project is currently maintained as an active development / hackathon project.
