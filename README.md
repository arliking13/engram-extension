# Engram — Browser Extension

> Keep the thread. Never lose context.

A continuity layer for AI-assisted development sessions.
Monitors long AI chats, tracks health, and generates seamless handoff packages when context degrades.

## Status
🚧 MVP — Hackathon Build (Scale Without Borders AI Hackathon, May 2025)

## Platforms
| Platform | Status |
|----------|--------|
| Claude.ai | ✅ MVP |
| Gemini | 🚧 Stub |

## Structure

```
extension/
  manifest.json              # Chrome Extension Manifest v3
  platforms/
    base/parser.js           # Shared interface for all platforms
    claude/parser.js         # Claude.ai DOM parser (MVP)
    gemini/parser.js         # Gemini stub (TODO)
  background/
    worker.js                # Service worker — storage + handoff logic
  storage/
    storage.js               # IndexedDB wrapper — project-isolated
  popup/
    popup.html / .css / .js  # Extension popup UI
```

## Install (Dev Mode)

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` folder

## How It Works

1. Extension monitors Claude.ai via MutationObserver
2. Messages and code blocks are extracted incrementally
3. Health score computed from message count, text volume, DOM size
4. When health drops → generate handoff via popup
5. Continuation prompt copied to clipboard → paste in new chat

## Knowledge Base

See `../AI_Knowledge_Base/` for the companion knowledge base tool.

```bash
python scripts/kb.py add <url_or_file>
python scripts/kb.py status
python scripts/kb.py search "query"
```
