import { readConfig, writeConfig, resolveProjectPath, createDefaultConfig } from '../services/config.js';
import { analyzeProject }                 from '../services/codebase.js';
import { searchTopics }                   from '../services/research.js';
import { addTextSource, addUrlSources, createNotebook } from '../services/notebooklm.js';
import { generateRoadmapContent, writeRoadmap }         from '../services/roadmap.js';
import { basename }                        from 'path';

export async function handleInit({ project_path, notebook_url, description, research_topics }) {
  const projectPath    = resolveProjectPath(project_path);
  const existingConfig = await readConfig(projectPath);

  // ── Step 1: Analyze codebase ────────────────────────────────────────────────
  const analysis = await analyzeProject(projectPath);

  const projectName    = existingConfig?.project_name    ?? analysis?.projectName ?? basename(projectPath);
  const resolvedDesc   = description                     ?? existingConfig?.description ?? analysis?.description ?? '';

  // Supplement auto-inferred research topics with competitive/pricing specific queries
  const baseTopics      = research_topics ?? existingConfig?.research_topics ?? analysis?.researchQueries ?? [];
  const resolvedTopics  = enrichResearchTopics(baseTopics, projectName, analysis.techStack, resolvedDesc);

  // ── Step 2: Resolve notebook URL — use passed, existing config, or auto-create ──
  let targetNotebookUrl  = notebook_url ?? existingConfig?.notebook_url ?? null;
  let notebookWasCreated = false;

  if (!targetNotebookUrl) {
    try {
      targetNotebookUrl  = await createNotebook();
      notebookWasCreated = true;
    } catch (err) {
      process.stderr.write(`[digital-pm-mcp] Auto-create notebook failed: ${err.message}\n`);
    }
  }

  // ── Manual fallback if notebook creation failed ─────────────────────────────
  if (!targetNotebookUrl) {
    return {
      content: [{
        type: 'text',
        text: [
          `## 🔍 Digital PM: Codebase Analyzed`,
          ``,
          `**Project**: ${analysis.projectName}`,
          `**Files**: ${analysis.fileCount}`,
          `**Tech stack**: ${analysis.techStack.join(', ') || 'Not detected'}`,
          ``,
          `Auto-creation failed (notebooklm-mcp may need re-authentication).`,
          `Please create a notebook manually:`,
          `1. Go to **https://notebooklm.google.com** → click **"+ New"**`,
          `2. Click **Share** → **"Anyone with the link"** → **"Copy link"**`,
          `3. Come back and say: **"Initialize my digital PM with URL: <paste>"**`,
        ].join('\n'),
      }],
    };
  }

  // ── Step 3: Save config ─────────────────────────────────────────────────────
  const config = createDefaultConfig(projectName, targetNotebookUrl, resolvedDesc, resolvedTopics);
  await writeConfig(projectPath, config);

  // ── Step 4: Add codebase summary to notebook ────────────────────────────────
  const sourceResults = [];
  try {
    await addTextSource('Codebase Architecture Summary', analysis.summary, targetNotebookUrl);
    sourceResults.push(`✅ **Codebase summary** added (${analysis.fileCount} files analyzed)`);
  } catch (err) {
    process.stderr.write(`[digital-pm-mcp] Codebase source failed: ${err.message}\n`);
    sourceResults.push(`⚠️ Codebase source failed — run "sync my digital PM" to retry`);
  }

  // ── Step 5: Run market + competitive research ────────────────────────────────
  let researchResults = [];
  let researchUrlCount = 0;

  try {
    researchResults = await searchTopics(resolvedTopics.slice(0, 8)); // cap at 8 topics for init

    const allUrls = researchResults
      .flatMap(r => r.results)
      .map(r => r.url)
      .filter(url => url && !url.includes('duckduckgo.com'));

    researchUrlCount = allUrls.length;

    if (allUrls.length > 0) {
      await addUrlSources(allUrls, targetNotebookUrl);
      sourceResults.push(`✅ **${allUrls.length} market research URLs** added as Website sources`);
    }

    const researchMarkdown = formatResearchSummary(researchResults, projectName);
    await addTextSource('Market & Competitive Research', researchMarkdown, targetNotebookUrl);
    sourceResults.push(`✅ **Research summary** added as Copied text source`);
  } catch (err) {
    process.stderr.write(`[digital-pm-mcp] Research failed: ${err.message}\n`);
    sourceResults.push(`⚠️ Research partially failed: ${err.message}`);
  }

  // ── Step 6: Generate and write ROADMAP.md ───────────────────────────────────
  let roadmapPath = null;
  try {
    const roadmapContent = generateRoadmapContent({
      projectName,
      description:    resolvedDesc,
      techStack:      analysis.techStack,
      fileCount:      analysis.fileCount,
      researchResults,
      notebookUrl:    targetNotebookUrl,
      researchTopics: resolvedTopics,
    });

    roadmapPath = await writeRoadmap(projectPath, roadmapContent);

    // Also add ROADMAP.md as a source so NotebookLM is aware of the plan
    await addTextSource('ROADMAP.md — Living Execution Graph', roadmapContent, targetNotebookUrl);
    sourceResults.push(`✅ **ROADMAP.md** generated and added as source`);
  } catch (err) {
    process.stderr.write(`[digital-pm-mcp] Roadmap generation failed: ${err.message}\n`);
    sourceResults.push(`⚠️ ROADMAP.md generation failed: ${err.message}`);
  }

  // ── Build success response ─────────────────────────────────────────────────
  const notebookNote = notebookWasCreated
    ? `_(New notebook created automatically — rename it in NotebookLM if you like)_`
    : `_(Using ${existingConfig?.notebook_url ? 'existing configured' : 'provided'} notebook)_`;

  const topicList = resolvedTopics.length > 0
    ? resolvedTopics.slice(0, 5).map(t => `\`${t}\``).join(', ')
    : 'none';

  return {
    content: [{
      type: 'text',
      text: [
        `## ✅ Digital PM Initialized — ${projectName}`,
        ``,
        `**Notebook**: ${targetNotebookUrl}`,
        notebookNote,
        `**Config**: \`.digitalpM.json\``,
        roadmapPath ? `**Roadmap**: \`ROADMAP.md\` written to project root` : '',
        ``,
        `### Sources Added to NotebookLM`,
        ...sourceResults,
        ``,
        `### What's Next`,
        ``,
        `**Start building** — your workflow is now:`,
        `1. Read \`ROADMAP.md\` for the current sprint board`,
        `2. Call \`digitalPM_plan("[feature]")\` for a JIT implementation brief`,
        `3. Implement → test → mark \`[x]\` in ROADMAP.md`,
        ``,
        `**Keep the PM current**:`,
        `- \`"Sync my digital PM"\` — re-snapshot codebase + refresh market research`,
        `- \`"Research [topic] via digital PM"\` — add competitive intel on demand`,
        `- \`"Log feedback: [user said X]"\` — capture user insights permanently`,
        `- \`"What should I build next?"\` — strategic query to your NotebookLM PM`,
        ``,
        `**Research topics configured**: ${topicList}`,
      ].filter(Boolean).join('\n'),
    }],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Supplements the base research topics with competitive/pricing-specific queries
 * that are essential for generating a meaningful ROADMAP.md.
 */
function enrichResearchTopics(baseTopics, projectName, techStack, description) {
  const year = new Date().getFullYear();
  const enriched = new Set(baseTopics);

  // Competitive landscape
  enriched.add(`${projectName} competitors market analysis ${year}`);

  // Pricing research (if applicable)
  if (description && /saas|subscription|app|platform|tool/i.test(description)) {
    enriched.add(`${projectName} pricing models SaaS ${year}`);
  }

  // Feature comparison for primary tech
  const primaryTech = techStack[0];
  if (primaryTech) {
    enriched.add(`${primaryTech} app feature comparison best practices ${year}`);
  }

  // User pain points
  enriched.add(`${projectName} user pain points feature requests ${year}`);

  return [...enriched].slice(0, 12); // cap at 12 total
}

function formatResearchSummary(results, projectName) {
  const lines = [`# Market & Competitive Research — ${projectName}`, ''];
  for (const { topic, results: topicResults } of results) {
    lines.push(`## ${topic}`);
    if (topicResults.length === 0) {
      lines.push('_No results found for this topic._');
    } else {
      for (const r of topicResults) {
        lines.push(`- **[${r.title}](${r.url})**`);
        if (r.description) lines.push(`  ${r.description}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}
