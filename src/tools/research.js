import { readConfig, resolveProjectPath } from '../services/config.js';
import { searchTopics }                   from '../services/research.js';
import { addUrlSources, addTextSource }   from '../services/notebooklm.js';

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

  // ── Collect all URLs and format research markdown ────────────────────────
  const allUrls = [];
  for (const { results: topicResults } of results) {
    for (const r of topicResults) {
      if (r.url) allUrls.push(r.url);
    }
  }
  const researchMarkdown = formatResearchMarkdown(results, config?.project_name);

  // ── Push to NotebookLM as proper sources ─────────────────────────────────
  const notebookUrl = config?.notebook_url ?? null;
  const sourceResults = [];

  if (notebookUrl) {
    // 1. Add each research URL as a "Websites" source — NotebookLM fetches the
    //    full page content, giving the notebook real grounding in the sources.
    if (allUrls.length > 0) {
      try {
        await addUrlSources(allUrls, notebookUrl);
        sourceResults.push(`✅ **${allUrls.length} research URLs** added as Website sources`);
      } catch (err) {
        process.stderr.write(`[digital-pm-mcp] URL source injection failed: ${err.message}\n`);
        sourceResults.push(`⚠️ URL sources failed: ${err.message}`);
      }
    }

    // 2. Also add a research summary as a "Copied text" source — gives the
    //    notebook a structured overview of what was found and why it matters.
    try {
      await addTextSource('Research Summary', researchMarkdown, notebookUrl);
      sourceResults.push(`✅ **Research summary** added as Copied text source`);
    } catch (err) {
      process.stderr.write(`[digital-pm-mcp] Summary source injection failed: ${err.message}\n`);
      sourceResults.push(`⚠️ Summary source failed: ${err.message}`);
    }
  }

  // ── Build response ───────────────────────────────────────────────────────
  const lines = [
    `## 🔬 Research Results`,
    ``,
    `Found results for **${results.length}** topic(s) — **${allUrls.length}** sources discovered.`,
    ``,
  ];

  if (sourceResults.length > 0) {
    lines.push(`### NotebookLM Sources Added`);
    for (const r of sourceResults) lines.push(r);
    lines.push('');
  } else if (notebookUrl === null) {
    lines.push(`_(Run \`digitalPM_init(notebook_url="...")\` to enable auto-capture to NotebookLM.)_`);
    lines.push('');
  }

  lines.push(`---`, ``, researchMarkdown);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
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
