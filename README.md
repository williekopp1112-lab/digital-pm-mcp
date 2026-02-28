# digital-pm-mcp

> **Give Claude Code a senior product manager it can consult before answering your questions.**

Most AI coding sessions are missing context. Claude knows how to write code, but it doesn't know *what to build next*, *who your competitors are*, or *what your users are actually complaining about*.

`digital-pm-mcp` fixes that. It creates and maintains a [NotebookLM](https://notebooklm.google.com) notebook that acts as a living PM brain for your project — populated with your codebase architecture, competitive research, and captured user feedback. Claude Code consults it automatically when you ask strategic questions.

---

## The 30-Second Pitch

```
You:   "What's the most impactful feature I should build next?"

Claude: [calls digitalPM_query]
        → Checks your NotebookLM notebook (which knows your codebase,
          your competitors, and your captured user feedback)
        → Combines that with its own knowledge of your code
        → Returns a prioritized recommendation grounded in real context
```

No more generic AI answers. Your notebook becomes smarter every time you:
- Ship new code → `sync` updates the codebase snapshot
- Hear from a user → `feedback` logs it as a permanent source
- Want fresh intel → `research` adds real web sources NotebookLM can read

---

## What It Does

| Say this to Claude Code | What fires | What happens |
|---|---|---|
| "Sync my digital PM" | `digitalPM_sync` | Adds codebase summary + all .md files as NotebookLM sources |
| "My user reported a bug with the dashboard widgets" | `digitalPM_feedback` | Logs it as a permanent source in your notebook |
| "Research competitors for our new AI features via digital PM" | `digitalPM_research` | Adds research URLs as real Website sources (NotebookLM fetches full content) |
| "What should I build next based on market research?" | `digitalPM_query` | Queries your notebook and combines the answer with Claude's code knowledge |
| "Initialize my digital PM" | `digitalPM_init` | Analyzes the codebase and bootstraps the whole system |

You never type the function names. Just talk to Claude naturally.

---

## How Sources Actually Get Added

Unlike tools that just inject text into a chat, `digital-pm-mcp` uses browser automation to add **real, permanent sources** to your NotebookLM notebook — the kind you'd add by clicking "+ Add sources" yourself.

- **Research URLs** → added as **Website sources** (NotebookLM fetches and indexes the full page)
- **Codebase summaries & .md files** → added as **Copied text sources**
- **User feedback & insights** → added as **Copied text sources**

This means your notebook is genuinely grounded in the content — it can cite sources, cross-reference them, and generate Audio Overviews, Mind Maps, and Study Guides from them.

---

## Requirements

- **Node.js 18+**
- **A Google account** with [NotebookLM](https://notebooklm.google.com) access (free)
- **[notebooklm-mcp](https://www.npmjs.com/package/notebooklm-mcp)** installed and authenticated (handles Google login)

---

## Installation

### 1. Set up notebooklm-mcp and authenticate with Google (one-time)

`digital-pm-mcp` reuses the Google auth that `notebooklm-mcp` manages. You need to set it up first:

```bash
# Add notebooklm-mcp to Claude Code (user-wide)
claude mcp add --scope user notebooklm npx notebooklm-mcp@latest
```

Then **restart Claude Code** and authenticate:

```
# Inside Claude Code, call:
setup_auth
```

This opens a browser window for Google login. Complete it, then verify with `get_health` — you should see `authenticated: true`. You only do this once.

---

### 2. Add digital-pm-mcp to Claude Code

```bash
# User-wide — available in every project (recommended)
claude mcp add --scope user digitalpm npx digital-pm-mcp@latest
```

**Restart Claude Code**, then run `/mcp` to confirm both servers show ✓ Connected:
```
notebooklm   ✓ Connected
digitalpm    ✓ Connected
```

> If either shows ✗ Failed: run `claude mcp list` to check the command, or open Claude Code with `claude --debug` to see the startup error.

---

### 3. Initialize for your project

Open Claude Code in your project directory and say:

> **"Initialize my digital PM for this project"**

Claude will:
1. Scan your codebase (respects `.gitignore`, detects tech stack)
2. Generate a rich architecture summary
3. Suggest competitive research topics based on your stack
4. Ask you to create a NotebookLM notebook and paste in the share URL
5. Save `.digitalpM.json` to your project root

That's it. Your PM brain is live.

---

## Example Conversations

**Strategic planning:**
> "Based on the codebase and market research, what's the most impactful feature I should build next?"

**Logging feedback:**
> "My beta user said the onboarding flow is confusing — they didn't understand what to do after signup. Log that as feedback."

**Staying current:**
> "We just shipped the new AI assistant feature. Sync the digital PM so the notebook reflects the latest code."

**Competitive research:**
> "Do some research on how other productivity apps handle recurring tasks and update our NotebookLM sources."

---

## How It Works

```
Your Codebase
     │
     ▼
digitalPM_init / digitalPM_sync
     │  Walks files (respects .gitignore)
     │  Detects tech stack, maps architecture
     │  Finds all .md files (README, CLAUDE.md, CHANGELOG, docs/)
     ▼
Browser Automation (patchright)
     │  Opens NotebookLM headlessly
     │  Clicks "+ Add sources → Copied text / Websites"
     │  Inserts each source individually
     ▼
NotebookLM Notebook  ◄──────────────────────────────────────┐
     │  Codebase architecture + .md files                    │
     │  Research URLs (full web content)                     │  digitalPM_research
     │  User feedback & product insights                     │  digitalPM_feedback
     ▼                                                       │
digitalPM_query                                    ──────────┘
     │  Asks your notebook a strategic question
     │  Claude combines the answer with its own code context
     ▼
You get PM-grade guidance, grounded in your actual project
```

---

## Config File

`.digitalpM.json` is created in your project root on init:

```json
{
  "notebook_url": "https://notebooklm.google.com/notebook/your-notebook-id",
  "project_name": "my-project",
  "description": "What the project does",
  "research_topics": [
    "React alternatives competitors 2026",
    "AI productivity app trends 2026"
  ],
  "sync": {
    "mode": "on_demand",
    "last_synced": "2026-02-26T17:00:00Z"
  }
}
```

> Add `.digitalpM.json` to `.gitignore` if your notebook URL is private.

---

## Keeping the Notebook Fresh

```
"Sync my digital PM"                  → updates code snapshot + research
"Sync digital PM — code only"         → re-analyzes codebase only
"Research new topics: AI agent tools" → pulls fresh research
```

A good habit: sync after any significant feature ship, so the PM context stays current.

---

## Architecture

```
digital-pm-mcp/
├── bin/
│   └── digital-pm-mcp.js        # CLI entry (npx target)
├── src/
│   ├── index.js                  # MCP server, tool registration, stdio transport
│   ├── tools/
│   │   ├── init.js               # digitalPM_init
│   │   ├── sync.js               # digitalPM_sync
│   │   ├── query.js              # digitalPM_query
│   │   ├── research.js           # digitalPM_research
│   │   └── feedback.js           # digitalPM_feedback
│   └── services/
│       ├── browser-source.js     # Patchright automation — adds real NotebookLM sources
│       ├── notebooklm.js         # Public API: addTextSource(), addUrlSources(), callNotebookLM()
│       ├── codebase.js           # Project analysis + summary generation
│       ├── research.js           # DuckDuckGo search (no API key needed)
│       └── config.js             # .digitalpM.json read/write
└── package.json
```

---

## Contributing

PRs welcome. Core dependencies: `@modelcontextprotocol/sdk`, `patchright`, and `zod`.

## License

MIT
