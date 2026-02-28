import { readConfig, writeConfig, resolveProjectPath, createDefaultConfig } from '../services/config.js';
import { analyzeProject }                 from '../services/codebase.js';
import { addTextSource, createNotebook }  from '../services/notebooklm.js';
import { basename }                        from 'path';

export async function handleInit({ project_path, notebook_url, description, research_topics }) {
  const projectPath    = resolveProjectPath(project_path);
  const existingConfig = await readConfig(projectPath);

  // ── Analyze codebase (always needed for the summary source) ────────────────
  const analysis = await analyzeProject(projectPath);

  const projectName    = existingConfig?.project_name    ?? analysis?.projectName ?? basename(projectPath);
  const resolvedDesc   = description                     ?? existingConfig?.description ?? analysis?.description ?? '';
  const resolvedTopics = research_topics                 ?? existingConfig?.research_topics ?? analysis?.researchQueries ?? [];

  // ── Resolve the target notebook URL ────────────────────────────────────────
  // Priority: explicitly passed → existing config → auto-create a new notebook
  let targetNotebookUrl  = notebook_url ?? existingConfig?.notebook_url ?? null;
  let notebookWasCreated = false;

  if (!targetNotebookUrl) {
    try {
      targetNotebookUrl  = await createNotebook();
      notebookWasCreated = true;
    } catch (err) {
      process.stderr.write(`[digital-pm-mcp] Auto-create notebook failed: ${err.message}\n`);
      // Fall through to the manual fallback below
    }
  }

  // ── Manual fallback if auto-create failed ──────────────────────────────────
  if (!targetNotebookUrl) {
    return {
      content: [{
        type: 'text',
        text: [
          `## 🔍 Digital PM: Codebase Analyzed`,
          ``,
          `**Project**: ${analysis.projectName}`,
          `**Files scanned**: ${analysis.fileCount}`,
          `**Tech stack**: ${analysis.techStack.join(', ') || 'Not detected'}`,
          ``,
          `---`,
          ``,
          `### One Step Needed`,
          ``,
          `Auto-creation failed (notebooklm-mcp may need re-authentication).`,
          `Please create a notebook manually:`,
          `1. Go to **https://notebooklm.google.com** → click **"+ New"**`,
          `2. Click **Share** → **"Anyone with the link"** → **"Copy link"**`,
          `3. Come back and say: **"Initialize my digital PM with this URL: <paste URL>"**`,
          ``,
          `Everything else — adding sources, configuring research topics — happens automatically.`,
          ``,
          `**Suggested research topics** (will be configured automatically):`,
          ``,
          analysis.researchQueries.map((q, i) => `${i + 1}. ${q}`).join('\n'),
        ].join('\n'),
      }],
    };
  }

  // ── Save config ────────────────────────────────────────────────────────────
  const config = createDefaultConfig(projectName, targetNotebookUrl, resolvedDesc, resolvedTopics);
  await writeConfig(projectPath, config);

  // ── Add codebase summary as a source ───────────────────────────────────────
  const sourceResults = [];
  try {
    await addTextSource('Codebase Architecture Summary', analysis.summary, targetNotebookUrl);
    sourceResults.push(`✅ **Codebase summary** added (${analysis.fileCount} files analyzed)`);
  } catch (err) {
    process.stderr.write(`[digital-pm-mcp] Init source failed: ${err.message}\n`);
    sourceResults.push(`⚠️ Could not add codebase summary: ${err.message}`);
    sourceResults.push(`   Run "sync my digital PM" to retry.`);
  }

  // ── Build success response ─────────────────────────────────────────────────
  const topicList = resolvedTopics.length > 0
    ? resolvedTopics.map(t => `\`${t}\``).join(', ')
    : 'none — add `research_topics` to `.digitalpM.json`';

  const notebookNote = notebookWasCreated
    ? `_(New notebook created automatically — rename it in NotebookLM if you like)_`
    : `_(Using ${existingConfig?.notebook_url ? 'existing configured' : 'provided'} notebook)_`;

  return {
    content: [{
      type: 'text',
      text: [
        `## ✅ Digital PM Initialized — ${projectName}`,
        ``,
        `**Notebook**: ${targetNotebookUrl}`,
        notebookNote,
        `**Config saved**: \`.digitalpM.json\``,
        ``,
        `### Sources Added`,
        ...sourceResults,
        ``,
        `### What's Next`,
        `- **"Sync my digital PM"** — re-snapshot the codebase + pull research`,
        `- **"Research [topic] via digital PM"** — add competitive intel as real sources`,
        `- **"What should I build next?"** — ask your PM a strategic question`,
        `- **"Log feedback: [user said X]"** — capture user insights permanently`,
        ``,
        `**Research topics configured**: ${topicList}`,
      ].join('\n'),
    }],
  };
}
