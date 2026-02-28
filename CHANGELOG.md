# Changelog

All notable changes to `digital-pm-mcp` will be documented here.

## [0.5.0] — 2026-02-28

### Added
- **`digitalPM_insights`** — one-shot strategic PM briefing: single browser session, 5-section digest (Competitive Gaps, Unmet User Demand, Technical Risk, #1 Priority for next 30 days, Pivot Risk). Run before any planning sprint.
- **`digitalPM_schedule`** — autonomous background sync installer. On macOS: writes a launchd plist to `~/Library/LaunchAgents/` and loads it so the notebook syncs on schedule even when Claude is closed. On other platforms: returns exact crontab instructions. Supports hourly / daily / weekly intervals; schedule stored in `.digitalpM.json`.
- **`bin/digital-pm-sync.js`** — standalone sync runner invoked by launchd/cron; accepts `[project-path] [--mode=code|research|both]`. Also exported as `digital-pm-sync` binary in `package.json`.

### Changed
- **`digitalPM_research` now uses Tavily** — replaced the brittle DuckDuckGo HTML scraper (bot-detected, unreliable) with the [Tavily](https://app.tavily.com) search API. Structured JSON results, no HTML parsing, no cookie juggling. Requires `TAVILY_API_KEY` env var (free tier: 1,000 searches/month). Add to MCP config: `"digital-pm-mcp": { "env": { "TAVILY_API_KEY": "tvly-..." } }`.
- `digitalPM_query` description updated — no longer mentions notebooklm-mcp subprocess (removed in v0.4.4); now accurately describes native browser automation.

### Breaking
- **`TAVILY_API_KEY` required for research** — `digitalPM_research` and `digitalPM_sync --mode=research` now throw a clear error if the key is missing. Get a free key at https://app.tavily.com and add it to your MCP config env block.

---

## [0.4.4] — 2026-02-28

### Changed (Breaking internal architecture — no API change)
- **`digitalPM_query` now uses native browser automation** — removed the `notebooklm-mcp` subprocess entirely from the query path; `callNotebookLM()` now delegates directly to a new `queryNotebook()` function in `browser-source.js`, which uses the same `launchPersistentContext` already proven reliable for `digitalPM_sync`. Auth is now unified: one Chrome profile, one code path, zero external processes.
- **New `queryNotebook(question, notebookUrl)`** in `browser-source.js` — types the question into `textarea.query-box-input`, waits for `div.thinking-message` to clear, then polls `.to-user-container .message-text-content` for a new stable response (3 identical consecutive polls), mirroring notebooklm-mcp's own streaming detection algorithm

### Removed
- All subprocess infrastructure from `notebooklm.js`: `spawn`, JSON-RPC helpers, PATH augmentation — no longer needed for queries

---

## [0.4.3] — 2026-02-28

### Fixed
- **`digitalPM_query` auto-retry on auth failure** — `callNotebookLM()` now detects `{"success":false,"error":"…"}` JSON returned by notebooklm-mcp and throws a real Error so the retry loop can catch it; `handleQuery()` retries up to 3× with a 2.5s gap on auth/session errors; transient session drops now self-heal silently
- **Graceful degradation** when all retries fail — clean message with `npx notebooklm-mcp@latest → setup_auth` instructions instead of a raw JSON blob
- Version string in MCP server declaration now matches `package.json`

---

## [0.4.2] — 2026-02-28

### Added
- **Version check at startup** — checks npm for a newer version on launch; if one exists, prepends an update banner to the first tool response of the session with exact upgrade instructions
- **`src/services/version-check.js`** — lightweight checker using `fetch()` against the npm registry with a 5s timeout; never blocks startup
- **Handler wrapper** in `index.js` — all 6 tool handlers auto-prepend the update banner without individual file changes
- **`digitalPM_query` auto-retry** — if notebooklm-mcp returns an auth/session error, the query tool retries up to 3 times with a 2.5s delay before giving up; transient auth hiccups now recover silently instead of failing immediately
- **Auth-failure detection in `callNotebookLM`** — tool-level failure JSON (`{"success":false,"error":"…"}`) returned by notebooklm-mcp is now detected and thrown as a real `Error` so the retry loop can catch and handle it
- **Graceful degradation message** — when all retries fail, users get a clear, actionable message with the exact commands to re-authenticate (`npx notebooklm-mcp@latest` → `setup_auth`)

### Updated
- README step 3 now reflects fully automated init (no manual notebook creation / paste step)
- README "Staying Updated" section with exact `rm -rf ~/.npm/_npx` + restart instructions

### Fixed
- Version string in startup log now reads dynamically from `package.json` (no hardcoded string to forget)
- Version string in MCP server declaration now matches `package.json` (was hardcoded to 0.4.1)
- `createNotebook()` now skips the intermediate `/notebook/creating` URL when polling for the real UUID
- `openAddSourcesDialog()` detects auto-open dialog on new empty notebooks (avoids clicking a blocked button)
- `withNotebookPage()` adds 1.5s animation settle wait after page load

---

## [0.4.1] — 2026-02-27

### Fixed
- **Auth failure when adding NotebookLM sources** — switched from `storageState` cookie injection to `launchPersistentContext` using the notebooklm-mcp Chrome profile. Google binds auth to the full browser identity, not just cookies; injecting cookies into a fresh Chromium context always redirected to the Google sign-in page. Now reuses the same authenticated Chrome profile that notebooklm-mcp already set up
- **Concurrent profile lock handling** — if notebooklm-mcp has the Chrome profile open simultaneously, digital-pm-mcp now clones it to an isolated temp directory (skipping lock files) and cleans up after the operation
- Removed dependency on `browser_state/state.json` — persistent context auth is self-contained in the Chrome profile

---

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
