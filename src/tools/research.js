import { readConfig, resolveProjectPath } from '../services/config.js';
import { searchTopics } from '../services/research.js';

export async function handleResearch({ topics, project_path }) {
  const projectPath = resolveProjectPath(project_path);

  // Resolve topics: use provided, or fall back to config
  let resolvedTopics = topics && topics.length > 0 ? topics : null;

  if (!resolvedTopics) {
    const config = await readConfig(projectPath);
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

  const results = await searchTopics(resolvedTopics);

  const parts = [
    `## 🔬 Research Results`,
    ``,
    `Found results for **${results.length}** topic(s).`,
    ``,
    `**Add these as "Website" sources in your NotebookLM notebook:**`,
    `_(Click "+ Add sources" → "Website" and paste each URL)_`,
    ``,
  ];

  for (const { topic, results: topicResults } of results) {
    parts.push(`### ${topic}`);
    for (const r of topicResults) {
      parts.push(`- **[${r.title}](${r.url})**`);
      if (r.description) parts.push(`  ${r.description}`);
    }
    parts.push('');
  }

  return { content: [{ type: 'text', text: parts.join('\n') }] };
}
