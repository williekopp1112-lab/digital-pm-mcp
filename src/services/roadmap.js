/**
 * roadmap.js
 *
 * Generates, reads, and surgically patches ROADMAP.md — the Living Execution Graph
 * that bridges NotebookLM's market research with Claude Code's file-level execution.
 *
 * Structure:
 *   1. 🧭 Contextual North Star   — why we're building this, competitive landscape
 *   2. 🗺️ Strategic Epics         — feature groups justified by NotebookLM research
 *   3. ⚡ Active Execution Board  — current sprint, backlog, completed (state machine)
 *   4. 🔄 Feedback Loop           — [BLOCKER: Research Shift] stale-data alerts
 *   5. 📊 Metadata                — notebook URL, sync dates, codebase stats
 */

import { readFile, writeFile } from 'fs/promises';
import { join }                from 'path';

const ROADMAP_FILE = 'ROADMAP.md';
const today = () => new Date().toISOString().split('T')[0];

// ── Tech Stack → Epic mapping ─────────────────────────────────────────────────
// Each entry matches detected tech and produces an epic with starter features
// and a research insight sourced from DuckDuckGo results.

const STACK_EPICS = [
  {
    keywords:  ['React', 'Vue.js', 'Svelte', 'Nuxt.js', 'Astro'],
    epic:      'Frontend UX & Design System',
    icon:      '🎨',
    features:  [
      'Responsive layout across all breakpoints',
      'Accessible component library (WCAG 2.1 AA)',
      'Dark / light theme toggle with persistence',
      'Skeleton loading states & error boundaries',
    ],
  },
  {
    keywords:  ['Next.js'],
    epic:      'Web Application',
    icon:      '🌐',
    features:  [
      'Server-side rendering (SSR) performance pass',
      'API route documentation (OpenAPI spec)',
      'Static site generation for public pages',
    ],
  },
  {
    keywords:  ['Tauri', 'Electron'],
    epic:      'Native Desktop Experience',
    icon:      '🖥️',
    features:  [
      'Installer & auto-updater',
      'System tray integration',
      'Native OS notifications',
      'Offline mode with local data sync',
    ],
  },
  {
    keywords:  ['Express.js', 'Fastify', 'Hono', 'NestJS'],
    epic:      'Backend API',
    icon:      '⚙️',
    features:  [
      'REST API documentation (OpenAPI / Swagger)',
      'Request validation & sanitization middleware',
      'Rate limiting & abuse prevention',
      'Structured error logging & monitoring',
    ],
  },
  {
    keywords:  ['SQLite (Tauri)', 'PostgreSQL', 'MongoDB', 'Prisma', 'Drizzle ORM'],
    epic:      'Data Layer',
    icon:      '🗄️',
    features:  [
      'Database migration system',
      'Data export / import (CSV, JSON)',
      'Backup & restore flow',
      'Query performance audit',
    ],
  },
  {
    keywords:  ['MCP (Model Context Protocol)', 'Anthropic API', 'OpenAI API'],
    epic:      'AI Integration',
    icon:      '🤖',
    features:  [
      'Context window optimization',
      'Streaming response UI',
      'Multi-model fallback / routing',
      'Prompt versioning & A/B testing',
    ],
  },
  {
    keywords:  ['Zustand', 'Redux', 'Jotai'],
    epic:      'State Management',
    icon:      '🔄',
    features:  [
      'State persistence across sessions',
      'Optimistic UI updates',
      'Time-travel debugging / DevTools',
    ],
  },
  {
    keywords:  ['Tailwind CSS'],
    epic:      'Design Tokens & Theming',
    icon:      '🖌️',
    features:  [
      'Design token system (colors, spacing, typography)',
      'Component variant matrix',
      'Storybook / component playground',
    ],
  },
];

// Always appended regardless of tech stack
const BASE_EPICS = [
  {
    epic:     'Quality & Testing',
    icon:     '✅',
    features: [
      'Unit test coverage ≥ 80%',
      'Integration test suite',
      'CI/CD pipeline (lint → test → build → deploy)',
      'Performance benchmark baseline',
    ],
  },
  {
    epic:     'Developer Experience & Docs',
    icon:     '📚',
    features: [
      'Getting-started guide (< 5 min to first run)',
      'API / tool reference documentation',
      'Example projects or demo',
      'Contributing & release guide',
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Pull top competitor entries from DuckDuckGo research results.
 * Prioritises results from topics containing "competitor" or "alternative".
 */
function extractCompetitors(researchResults, max = 5) {
  const rows = [];

  // Favour competitor-focused topics first
  const sorted = [...researchResults].sort((a, b) => {
    const aScore = /competitor|alternative|vs\b/i.test(a.topic) ? 1 : 0;
    const bScore = /competitor|alternative|vs\b/i.test(b.topic) ? 1 : 0;
    return bScore - aScore;
  });

  for (const { results: topicResults } of sorted) {
    for (const r of topicResults) {
      if (rows.length >= max) break;
      if (!r.url || r.url.includes('duckduckgo.com')) continue;

      // Clean competitor name from page title
      const name = (r.title || r.url)
        .split(/[|–—\-:]/)[0]
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 45);

      const approach = (r.description || '').replace(/\s+/g, ' ').trim().slice(0, 90);
      rows.push({ name, url: r.url, approach });
    }
  }

  return rows;
}

/**
 * Derive relevant epics from the detected tech stack.
 * Attaches the best-matching research insight to each epic.
 */
function deriveEpics(techStack, researchResults) {
  const matched  = [];
  const usedEpics = new Set();

  for (const mapping of STACK_EPICS) {
    if (!techStack.some(t => mapping.keywords.includes(t))) continue;
    if (usedEpics.has(mapping.epic)) continue;
    usedEpics.add(mapping.epic);

    const insight = pickInsight(researchResults, mapping.keywords);
    matched.push({ ...mapping, insight });
  }

  for (const base of BASE_EPICS) {
    if (usedEpics.has(base.epic)) continue;
    matched.push({ ...base, insight: 'See NotebookLM for market research on this area.' });
  }

  return matched;
}

/** Pick the best research snippet that's relevant to the given tech keywords. */
function pickInsight(researchResults, keywords) {
  for (const { topic, results: topicResults } of researchResults) {
    const topicMatches = keywords.some(k => topic.toLowerCase().includes(k.toLowerCase()));
    for (const r of topicResults) {
      if (r.description && r.description.length > 40) {
        if (topicMatches || researchResults.length < 3) {
          return r.description.slice(0, 130);
        }
      }
    }
  }
  // Fallback: first non-empty snippet anywhere
  for (const { results: topicResults } of researchResults) {
    for (const r of topicResults) {
      if (r.description && r.description.length > 40) return r.description.slice(0, 130);
    }
  }
  return 'See NotebookLM for market research supporting this epic.';
}

// ── ROADMAP.md content generator ──────────────────────────────────────────────

/**
 * Generates the complete ROADMAP.md content as a string.
 *
 * @param {object} opts
 * @param {string}   opts.projectName
 * @param {string}   opts.description
 * @param {string[]} opts.techStack
 * @param {number}   opts.fileCount
 * @param {Array}    opts.researchResults  — from searchTopics()
 * @param {string}   opts.notebookUrl
 * @param {string[]} opts.researchTopics
 * @returns {string}
 */
export function generateRoadmapContent({
  projectName,
  description,
  techStack,
  fileCount,
  researchResults,
  notebookUrl,
  researchTopics,
}) {
  const date        = today();
  const competitors = extractCompetitors(researchResults);
  const epics       = deriveEpics(techStack, researchResults);
  const lines       = [];

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push(`# ${projectName} — Roadmap`);
  lines.push('');
  lines.push(`> **Living Execution Graph** · [digital-pm-mcp](https://github.com/williekopp1112-lab/digital-pm-mcp) · Last deep refresh: ${date}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── 1. Contextual North Star ──────────────────────────────────────────────
  lines.push('## 🧭 Contextual North Star');
  lines.push('');
  lines.push(`**What we're building**: ${description || projectName}`);
  lines.push('');

  if (competitors.length > 0) {
    lines.push('**Competitive Landscape** _(sourced from market research — update as the space evolves)_:');
    lines.push('');
    lines.push('| Competitor | Their approach | Our edge |');
    lines.push('|------------|----------------|----------|');
    for (const c of competitors) {
      const approach = c.approach || 'N/A';
      lines.push(`| [${c.name}](${c.url}) | ${approach} | _← Define our differentiator_ |`);
    }
    lines.push('');
  }

  lines.push(`> 🔎 **Research basis**: ${researchResults.length} topic(s) indexed in NotebookLM on ${date}.`);
  lines.push(`> Ask your PM: _"How do we differentiate from competitors based on the latest research?"_`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── 2. Strategic Epics ────────────────────────────────────────────────────
  lines.push('## 🗺️ Strategic Epics');
  lines.push('');

  for (const epic of epics) {
    lines.push(`### ${epic.icon} ${epic.epic}`);
    lines.push('');
    lines.push(`> 💡 **NotebookLM Insight**: _"${epic.insight}"_`);
    lines.push('');
    lines.push('| Feature | Status | Priority |');
    lines.push('|---------|--------|----------|');
    for (let i = 0; i < epic.features.length; i++) {
      const priority = i < 2 ? 'P1' : 'P2';
      lines.push(`| ${epic.features[i]} | Planned | \`${priority}\` |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // ── 3. Active Execution Board ─────────────────────────────────────────────
  lines.push('## ⚡ Active Execution Board');
  lines.push('');
  lines.push('> **Protocol for Claude Code**');
  lines.push('> 1. Read this board BEFORE writing any code');
  lines.push('> 2. Call `digitalPM_plan("[feature name]")` to get a JIT implementation brief');
  lines.push('> 3. State machine: `[ ]` planned → `[/]` in progress → `[x]` verified (tests must pass to close)');
  lines.push('> 4. **Feature not on this board?** Run `digitalPM_plan` first → update Strategic Epics → then code');
  lines.push('> 5. **Research contradicts the plan?** Add a `[BLOCKER: Research Shift]` to the Feedback Loop → enter Plan Mode');
  lines.push('');

  // Current Sprint — first P1 feature from each of the first two epics
  const sprintItems = epics.slice(0, 2).map(e => ({ item: e.features[0], epic: e.epic })).filter(Boolean);
  lines.push('### 🔥 Current Sprint');
  lines.push('');
  for (const { item, epic } of sprintItems) {
    lines.push(`- [ ] **${epic}**: ${item}`);
  }
  if (sprintItems.length === 0) lines.push('_No sprint items yet — pull from the backlog below._');
  lines.push('');

  // Backlog — all remaining P1/P2 items
  const backlogItems = epics.flatMap(e =>
    e.features.slice(1).map((f, i) => ({ feature: f, priority: i < 1 ? 'P1' : 'P2', epic: e.epic }))
  );
  lines.push('### 📋 Backlog (Prioritized)');
  lines.push('');
  for (const item of backlogItems) {
    lines.push(`- [ ] \`${item.priority}\` **${item.epic}**: ${item.feature}`);
  }
  lines.push('');

  lines.push('### ✅ Completed');
  lines.push('');
  lines.push('_Nothing shipped yet — time to execute._');
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── 4. Feedback Loop ──────────────────────────────────────────────────────
  lines.push('## 🔄 Feedback Loop — Stale Data Alerts');
  lines.push('');
  lines.push('> Add `[BLOCKER: Research Shift]` entries when new market research invalidates a planned feature.');
  lines.push('> **Halt execution and enter Plan Mode until each blocker is resolved.**');
  lines.push('');
  lines.push('_No blockers detected._');
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── 5. Metadata ───────────────────────────────────────────────────────────
  lines.push('## 📊 Metadata');
  lines.push('');
  lines.push(`- **NotebookLM**: [Open notebook](${notebookUrl})`);
  lines.push(`- **Last deep refresh**: ${date}`);
  lines.push(`- **Last tactical sync**: ${date}`);
  lines.push(`- **Codebase**: ${fileCount} files · ${techStack.slice(0, 5).join(', ') || 'Not detected'}`);
  lines.push(`- **Research topics**: ${(researchTopics || []).slice(0, 6).join(', ') || 'Auto-inferred'}`);

  return lines.join('\n');
}

// ── File I/O ──────────────────────────────────────────────────────────────────

export async function writeRoadmap(projectPath, content) {
  const dest = join(projectPath, ROADMAP_FILE);
  await writeFile(dest, content, 'utf8');
  return dest;
}

export async function readRoadmap(projectPath) {
  try {
    return await readFile(join(projectPath, ROADMAP_FILE), 'utf8');
  } catch {
    return null;
  }
}

// ── Tactical patches (state machine updates) ──────────────────────────────────

/**
 * Updates the "Last tactical sync" date in the Metadata section.
 * Called automatically after every digitalPM_sync run.
 */
export async function patchTacticalSync(projectPath) {
  const content = await readRoadmap(projectPath);
  if (!content) return false;

  const patched = content.replace(
    /- \*\*Last tactical sync\*\*: \d{4}-\d{2}-\d{2}/,
    `- **Last tactical sync**: ${today()}`
  );
  if (patched === content) return false;

  await writeRoadmap(projectPath, patched);
  return true;
}

/**
 * Moves a sprint/backlog item to a new state.
 * Finds the first line matching itemText and replaces its checkbox.
 *
 * @param {string} projectPath
 * @param {string} itemText      - Substring that uniquely identifies the item
 * @param {'in-progress'|'done'} status
 */
export async function patchSprintItem(projectPath, itemText, status) {
  const content = await readRoadmap(projectPath);
  if (!content) return false;

  const checkboxMap = { 'in-progress': '[/]', 'done': '[x]' };
  const newBox = checkboxMap[status];
  if (!newBox) return false;

  // Replace the first matching line's checkbox ([ ] or [/])
  const lines = content.split('\n');
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(itemText) && /\[[ /]\]/.test(lines[i])) {
      lines[i] = lines[i].replace(/\[[ /]\]/, newBox);
      changed = true;
      break;
    }
  }

  if (!changed) return false;
  await writeRoadmap(projectPath, lines.join('\n'));
  return true;
}

/**
 * Appends a [BLOCKER: Research Shift] entry to the Feedback Loop section.
 */
export async function addBlocker(projectPath, blockerText) {
  const content = await readRoadmap(projectPath);
  if (!content) return false;

  const entry = `\n- **[BLOCKER: Research Shift]** ${today()}: ${blockerText}`;
  const patched = content.replace('_No blockers detected._', `_No blockers detected._${entry}`);

  if (patched === content) return false;
  await writeRoadmap(projectPath, patched);
  return true;
}
