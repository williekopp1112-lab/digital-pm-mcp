import { readConfig, writeConfig, resolveProjectPath } from '../services/config.js';
import { syncProject }                                  from '../services/codebase.js';
import { searchTopics }                                 from '../services/research.js';
import { injectIntoNotebook }                           from '../services/notebooklm.js';

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

  const notebookUrl   = config.notebook_url ?? null;
  const summaryParts  = [`## 🔄 Digital PM Sync — ${config.project_name}\n`];
  const injectionJobs = []; // { label, content } — collected then pushed together

  // ── Code sync ─────────────────────────────────────────────────────────────
  if (mode === 'code' || mode === 'both') {
    const result = await syncProject(projectPath, config);
    await writeConfig(projectPath, { sync: { ...config.sync, last_synced: result.lastSync } });

    summaryParts.push(`### Codebase Snapshot`);
    summaryParts.push(`Files analyzed: **${result.fileCount}** | Synced: \`${result.lastSync}\``);
    summaryParts.push('');

    injectionJobs.push({ label: 'CODEBASE SYNC', content: result.updatedSummary });
  }

  // ── Research sync ─────────────────────────────────────────────────────────
  if (mode === 'research' || mode === 'both') {
    const topics = config.research_topics ?? [];
    if (topics.length > 0) {
      const researchResults = await searchTopics(topics);

      const researchMarkdown = formatResearchMarkdown(researchResults, config.project_name);
      summaryParts.push(`### Research Updates`);
      summaryParts.push(`Topics searched: **${topics.length}**`);
      summaryParts.push('');

      injectionJobs.push({ label: 'RESEARCH UPDATE', content: researchMarkdown });
    } else {
      summaryParts.push(`_No research topics configured. Add \`research_topics\` to \`.digitalpM.json\`._`);
    }
  }

  // ── Auto-inject everything into NotebookLM ────────────────────────────────
  const injectionResults = [];

  if (notebookUrl && injectionJobs.length > 0) {
    for (const job of injectionJobs) {
      try {
        await injectIntoNotebook(job.label, job.content, notebookUrl);
        injectionResults.push(`✅ ${job.label} captured in NotebookLM`);
      } catch (err) {
        process.stderr.write(`[digital-pm-mcp] Injection failed for ${job.label}: ${err.message}\n`);
        injectionResults.push(`⚠️ ${job.label} injection failed: ${err.message}`);
      }
    }
    summaryParts.push(`### NotebookLM Auto-Capture`);
    for (const r of injectionResults) summaryParts.push(r);
    summaryParts.push('');
  } else if (!notebookUrl) {
    summaryParts.push(`_Run \`digitalPM_init(notebook_url="...")\` to enable auto-capture to NotebookLM._`);
  }

  return { content: [{ type: 'text', text: summaryParts.join('\n') }] };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatResearchMarkdown(results, projectName) {
  const parts = [];
  if (projectName) parts.push(`**Project**: ${projectName}\n`);
  for (const { topic, results: topicResults } of results) {
    parts.push(`### ${topic}`);
    for (const r of topicResults) {
      parts.push(`- **[${r.title}](${r.url})**`);
      if (r.description) parts.push(`  ${r.description}`);
    }
    parts.push('');
  }
  return parts.join('\n');
}
