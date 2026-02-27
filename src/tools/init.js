import { readConfig, writeConfig, resolveProjectPath, createDefaultConfig } from '../services/config.js';
import { analyzeProject } from '../services/codebase.js';
import { basename } from 'path';

export async function handleInit({ project_path, notebook_url, description, research_topics }) {
  const projectPath    = resolveProjectPath(project_path);
  const existingConfig = await readConfig(projectPath);

  // ── Phase B: notebook_url provided — save config ──────────────────────────
  if (notebook_url) {
    const analysis = existingConfig ? null : await analyzeProject(projectPath);

    const projectName = existingConfig?.project_name
      ?? analysis?.projectName
      ?? basename(projectPath);

    const resolvedDesc = description
      ?? existingConfig?.description
      ?? analysis?.description
      ?? '';

    const resolvedTopics = research_topics
      ?? existingConfig?.research_topics
      ?? analysis?.researchQueries
      ?? [];

    const config = createDefaultConfig(projectName, notebook_url, resolvedDesc, resolvedTopics);
    await writeConfig(projectPath, config);

    return {
      content: [{
        type: 'text',
        text: [
          `## ✅ Digital PM Initialized`,
          ``,
          `**Project**: ${projectName}`,
          `**Notebook**: ${notebook_url}`,
          `**Config saved**: \`${projectPath}/.digitalpM.json\``,
          ``,
          `Your digital PM is ready. You can now:`,
          `- \`digitalPM_query\` — ask your PM anything about the project or market`,
          `- \`digitalPM_research\` — pull in new competitive research`,
          `- \`digitalPM_feedback\` — capture feedback or insights`,
          `- \`digitalPM_sync\` — refresh the notebook with the latest codebase snapshot`,
        ].join('\n'),
      }],
    };
  }

  // ── Phase A: analyze codebase, return content for Claude to action ─────────
  const analysis = await analyzeProject(projectPath);

  return {
    content: [{
      type: 'text',
      text: [
        `## 🔍 Digital PM: Project Analyzed`,
        ``,
        `**Project**: ${analysis.projectName}`,
        `**Files scanned**: ${analysis.fileCount}`,
        `**Tech stack detected**: ${analysis.techStack.join(', ') || 'Not detected'}`,
        ``,
        `---`,
        ``,
        `### Next Steps`,
        ``,
        `**Step 1 — Create the NotebookLM notebook:**`,
        `1. Go to https://notebooklm.google.com and click **"+ Create new"**`,
        `2. Name it: **"${analysis.projectName} — Digital PM"**`,
        `3. Click **"+ Add sources"** → **"Copied text"**`,
        `4. Paste the **Codebase Summary** below and click Insert`,
        ``,
        `**Step 2 — Add research sources:**`,
        `For each query below, click **"+ Add sources"** → **"Website"** and paste the search URL,`,
        `OR use your notebooklm tools to run a web search on each topic.`,
        ``,
        `**Step 3 — Save the config:**`,
        `Copy the notebook share URL and call:`,
        `\`digitalPM_init(notebook_url="<paste URL here>")\``,
        ``,
        `---`,
        ``,
        `### Suggested Research Queries`,
        ``,
        analysis.researchQueries.map((q, i) => `${i + 1}. \`${q}\``).join('\n'),
        ``,
        `---`,
        ``,
        `### Codebase Summary`,
        `_(Paste this into NotebookLM as a "Copied text" source)_`,
        ``,
        analysis.summary,
      ].join('\n'),
    }],
  };
}
