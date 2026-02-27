import { readConfig, resolveProjectPath } from '../services/config.js';
import { injectIntoNotebook }             from '../services/notebooklm.js';

const CATEGORY_LABELS = {
  feature:  '🛠 Feature Request',
  bug:      '🐛 Bug Report',
  insight:  '💡 Product Insight',
  goal:     '🎯 Product Goal',
  market:   '📊 Market Observation',
};

export async function handleFeedback({ feedback, category = 'insight', project_path, source }) {
  const projectPath = resolveProjectPath(project_path);
  const config      = await readConfig(projectPath);

  const projectName = config?.project_name ?? 'Unknown Project';
  const notebookUrl = config?.notebook_url  ?? null;
  const label       = CATEGORY_LABELS[category] ?? CATEGORY_LABELS.insight;
  const timestamp   = new Date().toISOString().replace('T', ' ').split('.')[0] + ' UTC';

  // ── Format note ──────────────────────────────────────────────────────────
  const note = [
    `# ${label}: ${projectName}`,
    ``,
    `**Date**: ${timestamp}`,
    `**Category**: ${category}`,
    `**Project**: ${projectName}`,
    source ? `**Source**: ${source}` : null,
    ``,
    `## Feedback`,
    ``,
    feedback,
    ``,
    `---`,
    `_Captured by digital-pm-mcp_`,
  ].filter(l => l !== null).join('\n');

  // ── Auto-inject into NotebookLM ──────────────────────────────────────────
  if (notebookUrl) {
    try {
      await injectIntoNotebook('FEEDBACK NOTE', note, notebookUrl);
      return {
        content: [{
          type: 'text',
          text: [
            `## 📝 Feedback Captured`,
            ``,
            `**Category**: ${label}`,
            `**Project**: ${projectName}`,
            ``,
            `✅ **Automatically captured in your NotebookLM notebook** — no manual steps needed.`,
            ``,
            `---`,
            ``,
            note,
          ].join('\n'),
        }],
      };
    } catch (err) {
      process.stderr.write(`[digital-pm-mcp] NotebookLM injection failed: ${err.message}\n`);
      return {
        content: [{
          type: 'text',
          text: [
            `## 📝 Feedback Captured`,
            ``,
            `**Category**: ${label}`,
            `**Project**: ${projectName}`,
            ``,
            `⚠️ **Could not auto-push to NotebookLM**: ${err.message}`,
            ``,
            `---`,
            ``,
            note,
          ].join('\n'),
        }],
      };
    }
  }

  // No notebook configured yet
  return {
    content: [{
      type: 'text',
      text: [
        `## 📝 Feedback Captured`,
        ``,
        `**Category**: ${label}`,
        `**Project**: ${projectName}`,
        ``,
        `_(Run \`digitalPM_init(notebook_url="...")\` to enable auto-capture to NotebookLM.)_`,
        ``,
        `---`,
        ``,
        note,
      ].join('\n'),
    }],
  };
}
