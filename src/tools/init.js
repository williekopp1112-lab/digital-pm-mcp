import { readConfig, writeConfig, resolveProjectPath, createDefaultConfig } from '../services/config.js';
import { analyzeProject } from '../services/codebase.js';
import { addTextSource }  from '../services/notebooklm.js';
import { basename }       from 'path';

export async function handleInit({ project_path, notebook_url, description, research_topics }) {
  const projectPath    = resolveProjectPath(project_path);
  const existingConfig = await readConfig(projectPath);

  // ── Phase B: notebook_url provided — save config + auto-populate notebook ──
  if (notebook_url) {
    // Always (re-)analyze so we have the codebase summary ready to add as a source
    const analysis = await analyzeProject(projectPath);

    const projectName    = existingConfig?.project_name    ?? analysis?.projectName    ?? basename(projectPath);
    const resolvedDesc   = description                     ?? existingConfig?.description ?? analysis?.description ?? '';
    const resolvedTopics = research_topics                 ?? existingConfig?.research_topics ?? analysis?.researchQueries ?? [];

    const config = createDefaultConfig(projectName, notebook_url, resolvedDesc, resolvedTopics);
    await writeConfig(projectPath, config);

    // Auto-add the codebase summary as a "Copied text" source in the notebook
    const sourceResults = [];
    try {
      await addTextSource('Codebase Architecture Summary', analysis.summary, notebook_url);
      sourceResults.push(`✅ **Codebase summary** added to notebook (${analysis.fileCount} files analyzed)`);
    } catch (err) {
      process.stderr.write(`[digital-pm-mcp] Init source failed: ${err.message}\n`);
      sourceResults.push(`⚠️ Could not auto-add codebase summary: ${err.message}`);
      sourceResults.push(`   Run "sync my digital PM" to retry.`);
    }

    const topicList = resolvedTopics.length > 0
      ? resolvedTopics.map(t => `\`${t}\``).join(', ')
      : 'none — add `research_topics` to `.digitalpM.json`';

    return {
      content: [{
        type: 'text',
        text: [
          `## ✅ Digital PM Initialized — ${projectName}`,
          ``,
          `**Notebook**: ${notebook_url}`,
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

  // ── Phase A: analyze codebase, ask only for the notebook URL ──────────────
  // We do NOT ask the user to paste anything manually — that's all automated in Phase B.
  const analysis = await analyzeProject(projectPath);

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
        `### One Step Needed — Create an Empty Notebook`,
        ``,
        `1. Go to **https://notebooklm.google.com** and click **"+ New"**`,
        `2. Name it **"${analysis.projectName} — Digital PM"** (or anything you like)`,
        `3. Click the **Share** button (top right) → **"Anyone with the link"** → **"Copy link"**`,
        `4. Paste the URL back here — everything else happens automatically`,
        ``,
        `No manual pasting required. Once you share the URL, this tool will automatically:`,
        `- Add your codebase architecture summary as a notebook source`,
        `- Configure research topics for future syncs`,
        ``,
        `---`,
        ``,
        `**Research topics that will be configured:**`,
        ``,
        analysis.researchQueries.map((q, i) => `${i + 1}. ${q}`).join('\n'),
      ].join('\n'),
    }],
  };
}
