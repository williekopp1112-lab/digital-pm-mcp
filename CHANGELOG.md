# Changelog

All notable changes to `digital-pm-mcp` will be documented here.

## [0.4.0] — 2026-02-27

### Added
- `digitalPM_plan` — JIT implementation brief tool: queries NotebookLM for technical approach, competitive edge cases, pitfalls, differentiation, and test checklist before you write a line of code
- `src/services/roadmap.js` — Living Execution Graph service with generation, file I/O, and surgical patching
- `ROADMAP.md` auto-generated during `digitalPM_init` with five sections: Contextual North Star, Strategic Epics, Active Execution Board (state machine), Feedback Loop (blocker zone), Metadata
- Competitive landscape table auto-built from DuckDuckGo research results
- Strategic Epics auto-derived from detected tech stack with research insights from NotebookLM
- `[BLOCKER: Research Shift]` zone in ROADMAP.md — halts execution when market data contradicts the plan
- Sprint state machine: `[ ]` planned → `[/]` in progress → `[x]` verified (tests required)

### Changed
- `digitalPM_init` now runs market + competitive research automatically (competitive, pricing, user pain points)
- `digitalPM_init` adds ROADMAP.md itself as a NotebookLM source after generation
- `digitalPM_sync` patches ROADMAP.md "Last tactical sync" date after every run
- Research topics auto-enriched with competitive/pricing queries during init

---

## [0.3.2] — 2026-02-27

### Added
- `createNotebook()` in `browser-source.js` — navigates to notebooklm.google.com, clicks "New notebook", waits for the URL, returns the new notebook URL
- `digitalPM_init` now fully zero-configuration: automatically creates the NotebookLM notebook AND adds the codebase summary in one step

### Changed
- `digitalPM_init` no longer requires any manual steps for new users — just say "Initialize my digital PM" and everything happens automatically
- If auto-creation fails (e.g. auth issue), gracefully falls back to asking for a URL
- Users with an existing notebook can still pass `notebook_url` to init (existing behavior preserved)

---

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
