import { readConfig, writeConfig, resolveProjectPath } from '../services/config.js';
import { syncProject }                                  from '../services/codebase.js';
import { searchTopics }                                 from '../services/research.js';
import { addTextSource, addUrlSources }                 from '../services/notebooklm.js';
import fs                                               from 'fs/promises';
import path                                             from 'path';

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
  const sourceResults = [];

  // ── Code sync ─────────────────────────────────────────────────────────────
  if (mode === 'code' || mode === 'both') {
    const result = await syncProject(projectPath, config);
    await writeConfig(projectPath, { sync: { ...config.sync, last_synced: result.lastSync } });

    summaryParts.push(`### Codebase Snapshot`);
    summaryParts.push(`Files analyzed: **${result.fileCount}** | Synced: \`${result.lastSync}\``);
    summaryParts.push('');

    if (notebookUrl) {
      // 1. Add the AI-generated codebase summary as a "Copied text" source
      try {
        await addTextSource('Codebase Architecture Summary', result.updatedSummary, notebookUrl);
        sourceResults.push(`✅ **Codebase summary** added as source`);
      } catch (err) {
        process.stderr.write(`[digital-pm-mcp] Codebase source failed: ${err.message}\n`);
        sourceResults.push(`⚠️ Codebase summary failed: ${err.message}`);
      }

      // 2. Discover and add key .md files in the project as individual sources
      //    (README, CLAUDE.md, CHANGELOG, docs/, etc.)
      const mdFiles = await findMarkdownFiles(projectPath);
      if (mdFiles.length > 0) {
        let mdAdded = 0;
        for (const mdFile of mdFiles) {
          try {
            const content = await fs.readFile(mdFile, 'utf8');
            if (content.trim().length < 100) continue; // skip empty/trivial files
            const relPath = path.relative(projectPath, mdFile);
            await addTextSource(relPath, content, notebookUrl);
            mdAdded++;
          } catch (err) {
            process.stderr.write(`[digital-pm-mcp] MD file source failed (${mdFile}): ${err.message}\n`);
          }
        }
        if (mdAdded > 0) {
          sourceResults.push(`✅ **${mdAdded} .md file(s)** added as sources (README, CLAUDE.md, docs, etc.)`);
        }
      }
    }
  }

  // ── Research sync ─────────────────────────────────────────────────────────
  if (mode === 'research' || mode === 'both') {
    const topics = config.research_topics ?? [];
    if (topics.length > 0) {
      const researchResults = await searchTopics(topics);

      // Collect all URLs and the summary
      const allUrls = [];
      for (const { results: topicResults } of researchResults) {
        for (const r of topicResults) {
          if (r.url) allUrls.push(r.url);
        }
      }
      const researchMarkdown = formatResearchMarkdown(researchResults, config.project_name);

      summaryParts.push(`### Research Updates`);
      summaryParts.push(`Topics searched: **${topics.length}** | Sources found: **${allUrls.length}**`);
      summaryParts.push('');

      if (notebookUrl) {
        // Add research URLs as Website sources (NotebookLM fetches full content)
        if (allUrls.length > 0) {
          try {
            await addUrlSources(allUrls, notebookUrl);
            sourceResults.push(`✅ **${allUrls.length} research URLs** added as Website sources`);
          } catch (err) {
            process.stderr.write(`[digital-pm-mcp] URL sources failed: ${err.message}\n`);
            sourceResults.push(`⚠️ Research URL sources failed: ${err.message}`);
          }
        }

        // Also add a structured research summary as a text source
        try {
          await addTextSource('Research Summary', researchMarkdown, notebookUrl);
          sourceResults.push(`✅ **Research summary** added as source`);
        } catch (err) {
          process.stderr.write(`[digital-pm-mcp] Research summary source failed: ${err.message}\n`);
          sourceResults.push(`⚠️ Research summary failed: ${err.message}`);
        }
      }
    } else {
      summaryParts.push(`_No research topics configured. Add \`research_topics\` to \`.digitalpM.json\`._`);
    }
  }

  // ── Sources report ────────────────────────────────────────────────────────
  if (sourceResults.length > 0) {
    summaryParts.push(`### NotebookLM Sources Added`);
    for (const r of sourceResults) summaryParts.push(r);
    summaryParts.push('');
  } else if (!notebookUrl) {
    summaryParts.push(`_Run \`digitalPM_init(notebook_url="...")\` to enable auto-capture to NotebookLM._`);
  }

  return { content: [{ type: 'text', text: summaryParts.join('\n') }] };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Finds key markdown files in the project worth adding as notebook sources:
 * README, CLAUDE.md, CHANGELOG, and files in docs/ directories.
 * Skips node_modules, .git, and deeply nested files.
 */
async function findMarkdownFiles(projectPath, maxFiles = 15) {
  const PRIORITY_NAMES = ['README.md', 'CLAUDE.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'ARCHITECTURE.md'];
  const SKIP_DIRS      = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'vendor']);
  const found          = [];

  async function walk(dir, depth = 0) {
    if (depth > 3 || found.length >= maxFiles) return;
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }

    // Priority files first
    for (const name of PRIORITY_NAMES) {
      const full = path.join(dir, name);
      try {
        await fs.access(full);
        if (!found.includes(full)) found.push(full);
      } catch { /* not present */ }
    }

    // Recurse into non-skipped directories (docs/, src/, etc.)
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      // Prioritize docs directories
      if (entry.name === 'docs' || entry.name === 'documentation') {
        await walkForMarkdown(path.join(dir, entry.name), found, maxFiles);
      } else if (depth < 2) {
        await walk(path.join(dir, entry.name), depth + 1);
      }
    }
  }

  async function walkForMarkdown(dir, results, max) {
    if (results.length >= max) return;
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md') && !results.includes(path.join(dir, entry.name))) {
        results.push(path.join(dir, entry.name));
        if (results.length >= max) return;
      }
    }
  }

  await walk(projectPath);
  return found;
}

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
