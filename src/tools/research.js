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

  // ── Collect URLs — filter out DDG search pages (JS-rendered, NotebookLM can't fetch them) ──
  const allUrls = [];
  for (const { results: topicResults } of results) {
    for (const r of topicResults) {
      if (r.url && !r.url.includes('duckduckgo.com')) {
        allUrls.push(r.url);
      }
    }
  }

  const topicsWithResults   = results.filter(r => r.results.length > 0);
  const topicsWithNoResults = results.filter(r => r.results.length === 0).map(r => r.topic);

  const researchMarkdown = formatResearchMarkdown(results, config?.project_name);

  // ── Push to NotebookLM as proper sources ─────────────────────────────────
  const notebookUrl  = config?.notebook_url ?? null;
  const sourceResults = [];

  if (notebookUrl) {
    // 1. Add real research URLs as "Websites" sources
    if (allUrls.length > 0) {
      try {
        await addUrlSources(allUrls, notebookUrl);
        sourceResults.push(`✅ **${allUrls.length} research URLs** added as Website sources`);
      } catch (err) {
        process.stderr.write(`[digital-pm-mcp] URL source injection failed: ${err.message}\n`);
        sourceResults.push(`⚠️ URL sources failed: ${err.message}`);
      }
    } else {
      sourceResults.push(`⚠️ No URLs found. Check that TAVILY_API_KEY is set in your MCP config.`);
    }

    // 2. Add structured research summary as "Copied text" source
    if (topicsWithResults.length > 0) {
      try {
        await addTextSource('Research Summary', researchMarkdown, notebookUrl);
        sourceResults.push(`✅ **Research summary** added as Copied text source`);
      } catch (err) {
        process.stderr.write(`[digital-pm-mcp] Summary source injection failed: ${err.message}\n`);
        sourceResults.push(`⚠️ Summary source failed: ${err.message}`);
      }
    }
  }

  // ── Build response ───────────────────────────────────────────────────────
  const lines = [
    `## 🔬 Research Results`,
    ``,
    `Searched **${results.length}** topic(s) — **${allUrls.length}** fetchable sources found.`,
    ``,
  ];

  if (topicsWithNoResults.length > 0) {
    lines.push(`⚠️ No results for: ${topicsWithNoResults.map(t => `\`${t}\``).join(', ')}`);
    lines.push(`   Check that TAVILY_API_KEY is set correctly in your MCP config.`);
    lines.push('');
  }

  if (sourceResults.length > 0) {
    lines.push(`### NotebookLM Sources Added`);
    for (const r of sourceResults) lines.push(r);
    lines.push('');
  } else if (notebookUrl === null) {
    lines.push(`_(Run \`digitalPM_init(notebook_url="...")\` to enable auto-capture to NotebookLM.)_`);
    lines.push('');
  }

  if (topicsWithResults.length > 0) {
    lines.push(`---`, ``, researchMarkdown);
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatResearchMarkdown(results, projectName) {
  const parts = [];
  if (projectName) parts.push(`**Project**: ${projectName}\n`);

  for (const { topic, results: topicResults } of results) {
    parts.push(`### ${topic}`);
    if (topicResults.length === 0) {
      parts.push(`_No results found for this topic._`);
    } else {
      for (const r of topicResults) {
        parts.push(`- **[${r.title}](${r.url})**`);
        if (r.description) parts.push(`  ${r.description}`);
      }
    }
    parts.push('');
  }

  return parts.join('\n');
}
