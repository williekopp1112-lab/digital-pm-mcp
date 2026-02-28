/**
 * digitalPM_insights — Strategic PM Briefing
 *
 * Runs a single comprehensive structured query against the project's NotebookLM
 * notebook and returns a 5-section strategic digest. One browser session,
 * one response — covers all the PM angles you'd want before planning a sprint.
 *
 * No parameters needed. Just call digitalPM_insights and get a briefing.
 */

import { readConfig, resolveProjectPath } from '../services/config.js';
import { callNotebookLM }                 from '../services/notebooklm.js';

// ── Curated PM query template ─────────────────────────────────────────────────
// Structured so NotebookLM returns a consistent 5-section digest every time.
// Single query = single browser session = fast (vs. 5 separate sessions).

const INSIGHTS_QUERY = `
You are a senior product manager reviewing my project. Based on everything in this notebook
(codebase architecture, competitive research, user feedback, market data), give me a
structured strategic briefing in exactly these 5 sections:

## 1. Competitive Gaps
What are our top 3 gaps vs market alternatives right now?
Be specific — name the gap, name who does it better, say why it matters.

## 2. Unmet User Demand
What are the top 3 capabilities that users of similar products ask for most that we don't have?
Cite sources from the research if possible.

## 3. Technical Risk
What are our top 2 architectural or technical risks we should address before scaling?
Be concrete — vague warnings are not useful.

## 4. #1 Priority — Next 30 Days
One thing only: the single highest-impact action we should take in the next 30 days
to maximize competitive differentiation. Justify the choice.

## 5. Pivot Risk
Are there any signals from the research suggesting we're building in the wrong direction,
or that the market is moving somewhere we're not pointed?
If nothing alarming: say so directly, don't hedge.

Keep every section actionable and specific to this project. Cite sources where available.
`.trim();

// ── Tool handler ─────────────────────────────────────────────────────────────

export async function handleInsights({ project_path }) {
  const projectPath = resolveProjectPath(project_path);
  const config      = await readConfig(projectPath);

  if (!config) {
    return {
      content: [{
        type: 'text',
        text: [
          `## ❌ digitalPM_insights: Not initialized`,
          ``,
          `No \`.digitalpM.json\` found at \`${projectPath}\`.`,
          `Run \`digitalPM_init\` first to set up your Digital PM notebook.`,
        ].join('\n'),
      }],
    };
  }

  if (!config.notebook_url) {
    return {
      content: [{
        type: 'text',
        text: [
          `## ❌ digitalPM_insights: No notebook linked`,
          ``,
          `Run \`digitalPM_init(notebook_url="<url>")\` to link your NotebookLM notebook.`,
        ].join('\n'),
      }],
    };
  }

  const date = new Date().toISOString().split('T')[0];

  try {
    const insights = await callNotebookLM('ask_question', {
      question:     INSIGHTS_QUERY,
      notebook_url: config.notebook_url,
    });

    return {
      content: [{
        type: 'text',
        text: [
          `## 🧠 Digital PM Strategic Briefing — ${config.project_name}`,
          `> Generated ${date} from NotebookLM · Run \`digitalPM_sync\` to refresh context`,
          ``,
          `---`,
          ``,
          insights,
          ``,
          `---`,
          ``,
          `**Next steps:**`,
          `- Act on the #1 Priority above before your next session`,
          `- Run \`digitalPM_plan(feature="...")\` for implementation guidance on any gap`,
          `- Run \`digitalPM_sync\` after shipping to keep the notebook current`,
        ].join('\n'),
      }],
    };

  } catch (err) {
    return {
      content: [{
        type: 'text',
        text: [
          `## ⚠️ digitalPM_insights: Query Failed`,
          ``,
          `**Error:** ${err.message}`,
          ``,
          `**Try:**`,
          `1. Run \`digitalPM_sync\` to make sure the notebook has content`,
          `2. Run \`digitalPM_insights\` again (browser sessions can be slow to start)`,
        ].join('\n'),
      }],
    };
  }
}
