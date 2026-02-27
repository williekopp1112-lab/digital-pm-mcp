import { readConfig, resolveProjectPath } from '../services/config.js';

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

  const formattedNote = [
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

  const parts = [
    `## 📝 Feedback Captured`,
    ``,
    `**Category**: ${label}`,
    `**Project**: ${projectName}`,
    ``,
    `**Add to NotebookLM:**`,
    `1. Go to your notebook${notebookUrl ? `: ${notebookUrl}` : ' (run digitalPM_init first)'}`,
    `2. Click **"+ Add sources"** → **"Copied text"**`,
    `3. Paste the note below and click **Insert**`,
    ``,
    `---`,
    ``,
    formattedNote,
  ];

  return { content: [{ type: 'text', text: parts.join('\n') }] };
}
