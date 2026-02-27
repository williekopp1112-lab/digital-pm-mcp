# Changelog

All notable changes to `digital-pm-mcp` will be documented here.

## [0.1.0] — 2026-02-26

### Added
- `digitalPM_init` — two-phase project initialization: codebase analysis (Phase A) and notebook config save (Phase B)
- `digitalPM_sync` — re-analyze codebase and/or refresh research sources
- `digitalPM_query` — route PM questions to NotebookLM via notebooklm-mcp subprocess
- `digitalPM_research` — DuckDuckGo web search for competitive/market research (no API key required)
- `digitalPM_feedback` — structured PM note formatter for features, bugs, insights, goals, and market observations
- `.digitalpM.json` per-project config (notebook URL, research topics, sync timestamps)
- Smart codebase analysis: tech stack detection, directory tree, README + key file excerpts
- Auto-inferred research queries from package.json keywords and detected tech stack
- GitHub Actions workflow for manual npm publish (`workflow_dispatch`)
