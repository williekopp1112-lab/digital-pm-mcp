import { readConfig, writeConfig, resolveProjectPath } from '../services/config.js';
import { syncProject } from '../services/codebase.js';
import { searchTopics } from '../services/research.js';

export async function handleSync({ project_path, mode = 'both' }) {
  const projectPath = resolveProjectPath(project_path);
  const config      = await readConfig(projectPath);

  if (!config) {
    return {
      content: [{
        type: 'text',
        text: `No \`.digitalpM.json\` found at \`${projectPath}\`. Run \`digitalPM_init\` first.`,
      }],
    };
  }

  const parts = [`## 🔄 Digital PM Sync — ${config.project_name}\n`];
  const updates = {};

  // ── Code sync ───────────────────────────────────────────────────────────────
  if (mode === 'code' || mode === 'both') {
    const result = await syncProject(projectPath, config);
    updates['sync.last_synced'] = result.lastSync;

    parts.push(`### Updated Codebase Summary`);
    parts.push(`Files analyzed: **${result.fileCount}** | Synced: \`${result.lastSync}\``);
    parts.push(`\n**Add this to NotebookLM as a new "Copied text" source** (replaces the old summary):\n`);
    parts.push(result.updatedSummary);
    parts.push('\n');

    // Update config
    await writeConfig(projectPath, { sync: { ...config.sync, last_synced: result.lastSync } });
  }

  // ── Research sync ────────────────────────────────────────────────────────────
  if (mode === 'research' || mode === 'both') {
    const topics = config.research_topics ?? [];
    if (topics.length > 0) {
      const researchResults = await searchTopics(topics);
      parts.push(`### Research Updates\n`);
      parts.push(`**Add these as "Website" sources in NotebookLM:**\n`);
      for (const { topic, results } of researchResults) {
        parts.push(`#### ${topic}`);
        for (const r of results) {
          parts.push(`- [${r.title}](${r.url})`);
          if (r.description) parts.push(`  _${r.description}_`);
        }
        parts.push('');
      }
    } else {
      parts.push(`_No research topics configured. Add \`research_topics\` to \`.digitalpM.json\` or call \`digitalPM_research\` with explicit topics._`);
    }
  }

  return { content: [{ type: 'text', text: parts.join('\n') }] };
}
