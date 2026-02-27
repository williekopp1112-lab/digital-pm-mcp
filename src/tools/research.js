import { readConfig, resolveProjectPath } from '../services/config.js';
import { searchTopics }                   from '../services/research.js';
import { injectIntoNotebook }             from '../services/notebooklm.js';

export async function handleResearch({ topics, project_path }) {
  const projectPath = resolveProjectPath(project_path);
  const config      = await readConfig(projectPath);

  // ── Resolve topics ───────────────────────────────────────────────────────
  let resolvedTopics = topics && topics.length > 0 ? topics : null;

  if (!resolvedTopics) {
    resolvedTopics = config?.research_topics ?? [];
  }

  if (resolvedTopics.length === 0) {
    return {
      content: [{
        type: 'text',
        text: [
          `No research topics provided and none found in \`.digitalpM.json\`.`,
          ``,
          `Either:`,
          `- Pass topics directly: \`digitalPM_research(topics=["topic 1", "topic 2"])\``,
          `- Run \`digitalPM_init\` first so topics are auto-detected from your codebase`,
        ].join('\n'),
      }],
    };
  }

  // ── Search ───────────────────────────────────────────────────────────────
  const results = await searchTopics(resolvedTopics);

  // ── Format research as rich markdown ────────────────────────────────────
  const researchMarkdown = formatResearchMarkdown(results, config?.project_name);

  // ── Auto-inject into NotebookLM ──────────────────────────────────────────
  const notebookUrl = config?.notebook_url ?? null;

  if (notebookUrl) {
    try {
      await injectIntoNotebook('RESEARCH UPDATE', researchMarkdown, notebookUrl);
      return {
        content: [{
          type: 'text',
          text: [
            `## 🔬 Research Results`,
            ``,
            `Found results for **${results.length}** topic(s).`,
            ``,
            `✅ **Automatically captured in your NotebookLM notebook** — no manual steps needed.`,
            ``,
            `---`,
            ``,
            researchMarkdown,
          ].join('\n'),
        }],
      };
    } catch (err) {
      process.stderr.write(`[digital-pm-mcp] NotebookLM injection failed: ${err.message}\n`);
      return {
        content: [{
          type: 'text',
          text: [
            `## 🔬 Research Results`,
            ``,
            `Found results for **${results.length}** topic(s).`,
            ``,
            `⚠️ **Could not auto-push to NotebookLM**: ${err.message}`,
            `_(Is notebooklm-mcp authenticated? Run \`digitalPM_query\` to test the connection.)_`,
            ``,
            `---`,
            ``,
            researchMarkdown,
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
        `## 🔬 Research Results`,
        ``,
        `Found results for **${results.length}** topic(s).`,
        ``,
        `_(Run \`digitalPM_init(notebook_url="...")\` to enable auto-capture to NotebookLM.)_`,
        ``,
        `---`,
        ``,
        researchMarkdown,
      ].join('\n'),
    }],
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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
