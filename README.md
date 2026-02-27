# digital-pm-mcp

A **digital twin product manager** MCP server for any codebase.

Connects Claude Code to a NotebookLM notebook populated with smart codebase summaries, competitive market research, and captured user feedback — so Claude can consult it as a senior PM when building your project.

---

## What It Does

| Tool | What it does |
|------|-------------|
| `digitalPM_init` | Analyzes your codebase and bootstraps the NotebookLM notebook |
| `digitalPM_sync` | Re-analyzes the project and returns updated content to refresh the notebook |
| `digitalPM_query` | Asks a PM question answered by your notebook (competitors, next features, architecture) |
| `digitalPM_research` | Searches the web for competitive/market research and returns URLs to add as sources |
| `digitalPM_feedback` | Formats user feedback, goals, or insights as structured PM notes for the notebook |

---

## Requirements

- **Node.js 18+**
- **A Google account** with [NotebookLM](https://notebooklm.google.com) access
- **[notebooklm-mcp](https://www.npmjs.com/package/notebooklm-mcp)** authenticated (for `digitalPM_query`)

---

## Installation

### 1. Add to Claude Code

```bash
claude mcp add digitalpm npx digital-pm-mcp@latest
```

### 2. Initialize for your project

Open Claude Code in your project directory and say:

> **"Initialize my digital PM for this project"**

Claude will:
1. Analyze your codebase (tech stack, architecture, key files)
2. Generate a rich summary to paste into a new NotebookLM notebook
3. Suggest competitive research queries
4. Walk you through creating the notebook and adding sources
5. Save `.digitalpM.json` to your project once you provide the notebook URL

### 3. Authenticate notebooklm-mcp (required for `digitalPM_query`)

```bash
npx notebooklm-mcp@latest
# Then use the setup_auth tool to log in to Google
```

---

## Example Usage

Once initialized, ask Claude Code natural questions:

```
"What features should I build next in this project?"
"How does my app compare to competitors in this space?"
"Capture this feedback: users want keyboard shortcuts — category: feature"
"Research the latest trends for Tauri desktop apps"
"Sync my digital PM with the latest code changes"
```

---

## How It Works

```
Your Project
    │
    ▼
digitalPM_init
    │  Walks your codebase (respects .gitignore patterns)
    │  Detects tech stack from package.json, file types
    │  Generates rich markdown summary
    │  Infers research topics
    ▼
NotebookLM Notebook  ◄──────────────────────────────────────────────┐
    │  Codebase summary (architecture, components, data flow)        │
    │  Market research (competitors, trends, community feedback)      │
    │  User feedback (structured PM notes)                           │
    ▼                                                                │
digitalPM_query                                           digitalPM_research
    │  Spawns notebooklm-mcp subprocess                 digitalPM_feedback
    │  Routes question via JSON-RPC                     digitalPM_sync
    │  Returns PM answer grounded in sources
    ▼
Claude Code gets PM-grade guidance
```

---

## Config File

`.digitalpM.json` is created in your project root:

```json
{
  "notebook_url": "https://notebooklm.google.com/notebook/your-notebook-id",
  "project_name": "my-project",
  "description": "What the project does",
  "research_topics": [
    "React alternatives competitors 2026",
    "Tauri vs Electron desktop app comparison 2026"
  ],
  "sync": {
    "mode": "on_demand",
    "last_synced": "2026-02-26T17:00:00Z"
  },
  "created_at": "2026-02-26T17:00:00Z"
}
```

> **Tip**: Add `.digitalpM.json` to `.gitignore` if your notebook URL is private.

---

## Updating the Notebook

When you've made significant progress on the project, sync to keep the PM current:

```
"Sync my digital PM"                    → updates both code + research
"Sync my digital PM — code only"        → re-analyzes codebase only
"Research new topics: AI agent tools"   → pulls in fresh research on-demand
```

---

## Publishing a New Version

```bash
npm version patch   # or minor / major
git push && git push --tags
npm publish
```

Or use the GitHub Actions workflow for automated publishing (see `.github/workflows/release.yml`).

---

## Architecture

```
digital-pm-mcp/
├── bin/
│   └── digital-pm-mcp.js       # CLI entry point (#!/usr/bin/env node)
├── src/
│   ├── index.js                 # McpServer setup, tool registration, stdio transport
│   ├── tools/
│   │   ├── init.js              # digitalPM_init (Phase A + B)
│   │   ├── sync.js              # digitalPM_sync
│   │   ├── query.js             # digitalPM_query
│   │   ├── research.js          # digitalPM_research
│   │   └── feedback.js          # digitalPM_feedback
│   └── services/
│       ├── config.js            # .digitalpM.json read/write
│       ├── codebase.js          # Project analysis + summary generation
│       ├── research.js          # DuckDuckGo HTML scraping (no API key)
│       └── notebooklm.js        # notebooklm-mcp subprocess JSON-RPC client
├── .github/
│   └── workflows/
│       └── release.yml          # Manual-trigger npm publish
├── package.json
└── README.md
```

---

## Contributing

PRs welcome. The codebase is intentionally dependency-light — only `@modelcontextprotocol/sdk` and `zod`.

## License

MIT
