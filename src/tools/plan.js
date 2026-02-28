/**
 * digitalPM_plan — JIT Implementation Brief
 *
 * Generates a Just-In-Time implementation brief for a specific feature by
 * querying the project's NotebookLM notebook for:
 *   - Best practices from market research and competitive analysis
 *   - How competitors approach this feature and their edge cases
 *   - Potential pitfalls and gotchas
 *   - What would make our implementation stand out
 *
 * The brief is volatile — Claude Code ingests it, implements, verifies tests,
 * then marks the item [x] in ROADMAP.md and discards the brief.
 */

import { readConfig, resolveProjectPath }  from '../services/config.js';
import { callNotebookLM }                  from '../services/notebooklm.js';
import { readRoadmap }                     from '../services/roadmap.js';

export async function handlePlan({ feature, project_path }) {
  const projectPath = resolveProjectPath(project_path);
  const config      = await readConfig(projectPath);

  if (!config?.notebook_url) {
    return {
      content: [{
        type: 'text',
        text: [
          `## ❌ digitalPM_plan: No notebook configured`,
          ``,
          `Run \`digitalPM_init\` first to set up your Digital PM notebook.`,
          `This tool queries NotebookLM for research-backed implementation guidance.`,
        ].join('\n'),
      }],
    };
  }

  if (!feature) {
    return {
      content: [{
        type: 'text',
        text: [
          `## ❌ digitalPM_plan: No feature specified`,
          ``,
          `Usage: \`digitalPM_plan(feature="[feature name or description]")\``,
          ``,
          `Example: \`digitalPM_plan(feature="dark mode toggle with user preference persistence")\``,
        ].join('\n'),
      }],
    };
  }

  // ── Check if this feature is on the roadmap ─────────────────────────────
  const roadmap        = await readRoadmap(projectPath);
  const featureLower   = feature.toLowerCase();
  const onRoadmap      = roadmap
    ? roadmap.toLowerCase().includes(featureLower.slice(0, 30))
    : null;

  const pivotWarning = roadmap && !onRoadmap
    ? [
        ``,
        `> ⚠️ **Roadmap Alignment Check**: This feature was not found on the current roadmap.`,
        `> Per the execution protocol, update the Strategic Epics in \`ROADMAP.md\` before coding.`,
      ].join('\n')
    : '';

  // ── Build the NotebookLM query ──────────────────────────────────────────
  const question = [
    `Generate a structured implementation brief for this feature: "${feature}"`,
    ``,
    `Based on the codebase architecture, competitive research, and market data in this notebook:`,
    ``,
    `1. **Technical approach**: What is the recommended implementation strategy given our tech stack?`,
    `   - Key files/components to create or modify`,
    `   - Data model changes (if any)`,
    `   - State management considerations`,
    ``,
    `2. **Competitive edge cases**: How do the top 2-3 competitors implement this feature?`,
    `   - What do they do well?`,
    `   - Where do they fall short? (this is our opportunity)`,
    ``,
    `3. **Potential pitfalls**: What are the 3 most common mistakes teams make when building this?`,
    ``,
    `4. **Differentiation**: What would make our implementation stand out vs competitors?`,
    ``,
    `5. **Testing checklist**: What are the critical test cases to verify this is working correctly?`,
    ``,
    `Keep the brief actionable and specific to our stack. This brief is for immediate implementation.`,
  ].join('\n');

  // ── Query NotebookLM ────────────────────────────────────────────────────
  let briefContent;
  try {
    briefContent = await callNotebookLM('ask_question', {
      question,
      notebook_url: config.notebook_url,
    });
  } catch (err) {
    process.stderr.write(`[digital-pm-mcp] plan query failed: ${err.message}\n`);
    return {
      content: [{
        type: 'text',
        text: [
          `## ⚠️ digitalPM_plan: NotebookLM query failed`,
          ``,
          `Error: ${err.message}`,
          ``,
          `This usually means:`,
          `- \`notebooklm-mcp\` is not authenticated — run \`setup_auth\` in notebooklm-mcp`,
          `- The notebook hasn't finished indexing sources yet — wait a few minutes and retry`,
          `- The notebook URL in \`.digitalpM.json\` is incorrect`,
          ``,
          `**Fallback**: Proceed with implementation using your existing knowledge,`,
          `then run \`digitalPM_plan\` again once the notebook is accessible.`,
        ].join('\n'),
      }],
    };
  }

  // ── Format the brief ────────────────────────────────────────────────────
  const date = new Date().toISOString().split('T')[0];

  const response = [
    `## 🧠 Implementation Brief — ${feature}`,
    ``,
    `> **JIT Brief** generated ${date} from NotebookLM research · Discard after implementation`,
    `> Update \`ROADMAP.md\` sprint status: \`[ ]\` → \`[/]\` now, \`[x]\` after tests pass`,
    pivotWarning,
    ``,
    `---`,
    ``,
    briefContent,
    ``,
    `---`,
    ``,
    `### ⚡ Execution Checklist`,
    ``,
    `- [ ] Reviewed this brief`,
    `- [ ] Marked \`[/]\` in ROADMAP.md sprint board`,
    `- [ ] Implementation complete`,
    `- [ ] All test cases from brief are passing`,
    `- [ ] Marked \`[x]\` in ROADMAP.md (verified)`,
    `- [ ] Run \`digitalPM_sync\` if this changes the codebase architecture significantly`,
  ].join('\n');

  return { content: [{ type: 'text', text: response }] };
}
