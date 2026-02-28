# Changelog

All notable changes to `digital-pm-mcp` will be documented here.

## [0.3.1] — 2026-02-27

### Fixed
- DuckDuckGo searches now initialize cookies first (GET to duckduckgo.com) before POST — fixes bot-detection blocks
- Added GET fallback if POST returns no results
- DDG fallback search URLs are no longer added as NotebookLM Website sources (they're JS-rendered pages NotebookLM can't fetch)
- Research and sync tools now show a clear warning when DDG returns no results, instead of silently adding useless sources
- `searchTopic()` returns an empty array on complete failure (was returning a DDG fallback URL)

---

## [0.3.0] — 2026-02-27

### Changed
- `digitalPM_init` Phase A no longer asks users to manually paste codebase content into NotebookLM — just create an empty notebook and share the URL
- `digitalPM_init` Phase B now automatically adds the codebase architecture summary as a real "Copied text" source via browser automation (same mechanism as sync/research/feedback)

### Fixed
- Init flow was requiring manual source creation; now fully automated end-to-end

---

## [0.2.0] — 2026-02-26

### Added
- `browser-source.js` — patchright browser automation to add real permanent sources to NotebookLM UI (replaces chat injection)
- `addTextSource()` — adds content as a "Copied text" source (codebase summaries, .md files, feedback)
- `addUrlSources()` — adds URLs as "Websites" sources (NotebookLM fetches full content at each URL)
- `digitalPM_sync` now adds individual .md files (README, CLAUDE.md, docs/) as separate sources
- `digitalPM_research` now adds research URLs as real Website sources, not just summaries
- `digitalPM_feedback` now adds formatted PM notes as permanent Copied text sources
- Auth reuse from notebooklm-mcp's `browser_state/state.json` — no separate Google login required

### Changed
- Source injection no longer uses `ask_question` (was consuming the 50-query/day limit); now uses patchright to click "+ Add sources" directly
- Added `patchright` as a direct dependency (reuses notebooklm-mcp's Chromium download)

---

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
