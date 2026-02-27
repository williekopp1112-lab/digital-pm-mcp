import { readFile, readdir, stat } from 'fs/promises';
import { join, extname, basename, relative } from 'path';
import { createReadStream } from 'fs';

// ── Constants ────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  '__pycache__', '.venv', 'venv', 'env',
  'target',         // Rust
  '.cache', 'coverage', '.nyc_output',
  'vendor',         // Go / PHP
  '.gradle', '.idea', '.vscode',
  '.turbo', '.vercel', '.netlify',
  'storybook-static', '.docusaurus',
]);

const CODE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.c', '.cpp', '.h', '.cs', '.swift',
  '.vue', '.svelte', '.astro',
  '.sh', '.bash', '.zsh',
  '.sql', '.graphql', '.proto',
  '.toml', '.yaml', '.yml',
]);

const PRIORITY_FILES = [
  'package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod',
  'build.gradle', 'pom.xml',
  'README.md', 'README.rst', 'README.txt',
  'CHANGELOG.md',
];

const MAX_FILE_BYTES   = 8_000;
const MAX_TOTAL_CHARS  = 80_000;
const MAX_CODE_FILES   = 20;
const MAX_DIR_DEPTH    = 5;
const MAX_README_CHARS = 3_000;
const MAX_CODE_CHARS   = 2_000;

// ── File helpers ─────────────────────────────────────────────────────────────

async function safeReadFile(filePath, maxBytes = MAX_FILE_BYTES) {
  try {
    const stats = await stat(filePath);
    if (stats.size > 500_000) return '';
    return await new Promise((resolve) => {
      let data = '';
      const stream = createReadStream(filePath, { encoding: 'utf8', end: maxBytes - 1 });
      stream.on('data', chunk => { data += chunk; });
      stream.on('end', () => resolve(data));
      stream.on('error', () => resolve(''));
    });
  } catch {
    return '';
  }
}

async function listFiles(dir, currentDepth = 0) {
  if (currentDepth > MAX_DIR_DEPTH) return [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const results = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listFiles(fullPath, currentDepth + 1));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

async function buildDirectoryTree(projectPath, maxDepth = 3) {
  async function walk(dir, depth, prefix = '') {
    if (depth > maxDepth) return '';
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { return ''; }
    const filtered = entries
      .filter(e => !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
      .slice(0, 20);
    let out = '';
    for (let i = 0; i < filtered.length; i++) {
      const entry = filtered[i];
      const isLast = i === filtered.length - 1;
      out += `${prefix}${isLast ? '└── ' : '├── '}${entry.name}${entry.isDirectory() ? '/' : ''}\n`;
      if (entry.isDirectory() && depth < maxDepth) {
        out += await walk(join(dir, entry.name), depth + 1, prefix + (isLast ? '    ' : '│   '));
      }
    }
    return out;
  }
  return walk(projectPath, 0);
}

// ── Package metadata ─────────────────────────────────────────────────────────

function parsePackageJson(content) {
  try {
    const pkg = JSON.parse(content);
    return {
      name:            pkg.name,
      version:         pkg.version,
      description:     pkg.description,
      scripts:         Object.keys(pkg.scripts ?? {}),
      dependencies:    Object.keys(pkg.dependencies ?? {}),
      devDependencies: Object.keys(pkg.devDependencies ?? {}),
      keywords:        pkg.keywords ?? [],
    };
  } catch {
    return null;
  }
}

// ── Tech stack detection ─────────────────────────────────────────────────────

function detectTechStack(pkgData, fileExtensions) {
  const stack = new Set();
  if (pkgData) {
    const deps = [...pkgData.dependencies, ...pkgData.devDependencies];
    // Frameworks
    if (deps.includes('react'))                         stack.add('React');
    if (deps.includes('vue'))                           stack.add('Vue.js');
    if (deps.includes('svelte'))                        stack.add('Svelte');
    if (deps.includes('next'))                          stack.add('Next.js');
    if (deps.includes('nuxt'))                          stack.add('Nuxt.js');
    if (deps.includes('astro'))                         stack.add('Astro');
    if (deps.includes('@tauri-apps/api'))               stack.add('Tauri');
    if (deps.includes('electron'))                      stack.add('Electron');
    // Backend
    if (deps.includes('express'))                       stack.add('Express.js');
    if (deps.includes('fastify'))                       stack.add('Fastify');
    if (deps.includes('hono'))                          stack.add('Hono');
    if (deps.some(d => d.startsWith('@nestjs')))        stack.add('NestJS');
    // Databases
    if (deps.some(d => d.includes('prisma')))           stack.add('Prisma');
    if (deps.some(d => d.includes('drizzle')))          stack.add('Drizzle ORM');
    if (deps.includes('mongoose'))                      stack.add('MongoDB');
    if (deps.includes('pg') || deps.includes('postgres')) stack.add('PostgreSQL');
    if (deps.includes('@tauri-apps/plugin-sql'))        stack.add('SQLite (Tauri)');
    // Build
    if (deps.includes('vite'))                          stack.add('Vite');
    if (deps.includes('webpack'))                       stack.add('Webpack');
    if (deps.includes('esbuild'))                       stack.add('esbuild');
    // State
    if (deps.includes('zustand'))                       stack.add('Zustand');
    if (deps.includes('redux') || deps.some(d => d.includes('@reduxjs'))) stack.add('Redux');
    if (deps.includes('jotai'))                         stack.add('Jotai');
    // Styling
    if (deps.includes('tailwindcss'))                   stack.add('Tailwind CSS');
    // Testing
    if (deps.includes('vitest'))                        stack.add('Vitest');
    if (deps.includes('jest'))                          stack.add('Jest');
    // AI / MCP
    if (deps.some(d => d.includes('@modelcontextprotocol'))) stack.add('MCP (Model Context Protocol)');
    if (deps.includes('openai'))                        stack.add('OpenAI API');
    if (deps.some(d => d.includes('@anthropic-ai')))    stack.add('Anthropic API');
  }
  // From file extensions
  if (fileExtensions.has('.rs'))    stack.add('Rust');
  if (fileExtensions.has('.py'))    stack.add('Python');
  if (fileExtensions.has('.go'))    stack.add('Go');
  if (fileExtensions.has('.java'))  stack.add('Java');
  if (fileExtensions.has('.swift')) stack.add('Swift');
  return [...stack];
}

// ── Research query generation ────────────────────────────────────────────────

function generateResearchQueries(projectName, description, techStack, keywords) {
  const year = new Date().getFullYear();
  const queries = new Set();

  if (description) {
    queries.add(`${projectName} alternatives competitors ${year}`);
  }
  for (const tech of techStack.slice(0, 3)) {
    queries.add(`${tech} alternatives competitors ${year}`);
  }
  for (const kw of (keywords ?? []).slice(0, 3)) {
    queries.add(`${kw} market trends ${year}`);
  }
  queries.add(`${projectName} user feedback feature requests`);
  if (techStack.some(t => t.toLowerCase().includes('mcp'))) {
    queries.add(`Model Context Protocol MCP servers ecosystem ${year}`);
    queries.add(`Claude Code MCP developer tools ${year}`);
  }
  if (techStack.includes('Tauri')) {
    queries.add(`Tauri vs Electron desktop app comparison ${year}`);
  }
  return [...queries].slice(0, 10);
}

// ── Summary composer ─────────────────────────────────────────────────────────

function composeSummary({ projectName, description, techStack, dirTree, pkgData, readmeContent, codeContents, fileCount, projectPath }) {
  const date = new Date().toISOString().split('T')[0];
  const lines = [];

  lines.push(`# Digital PM Summary: ${projectName}`);
  lines.push(`_Generated ${date} by digital-pm-mcp_`);
  lines.push('');
  lines.push('## Project Overview');
  if (description) lines.push(`**Description**: ${description}`);
  lines.push(`**Total Source Files**: ${fileCount}`);
  lines.push('');

  if (techStack.length > 0) {
    lines.push('## Tech Stack');
    techStack.forEach(t => lines.push(`- ${t}`));
    lines.push('');
  }

  if (pkgData) {
    lines.push('## Package Metadata');
    if (pkgData.name)    lines.push(`- **Name**: ${pkgData.name}`);
    if (pkgData.version) lines.push(`- **Version**: ${pkgData.version}`);
    if (pkgData.scripts.length)   lines.push(`- **Scripts**: ${pkgData.scripts.join(', ')}`);
    if (pkgData.keywords.length)  lines.push(`- **Keywords**: ${pkgData.keywords.join(', ')}`);
    lines.push('');
    if (pkgData.dependencies.length > 0) {
      lines.push('## Runtime Dependencies');
      pkgData.dependencies.forEach(d => lines.push(`- ${d}`));
      lines.push('');
    }
  }

  if (dirTree) {
    lines.push('## Project Structure');
    lines.push('```');
    lines.push(dirTree.trim());
    lines.push('```');
    lines.push('');
  }

  if (readmeContent) {
    lines.push('## README');
    lines.push(readmeContent.slice(0, MAX_README_CHARS));
    if (readmeContent.length > MAX_README_CHARS) lines.push('\n_[README truncated]_');
    lines.push('');
  }

  if (Object.keys(codeContents).length > 0) {
    lines.push('## Key Source Files');
    for (const [relPath, content] of Object.entries(codeContents)) {
      lines.push(`### \`${relPath}\``);
      lines.push('```');
      lines.push(content.slice(0, MAX_CODE_CHARS));
      if (content.length > MAX_CODE_CHARS) lines.push('// [truncated]');
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyzes a project directory and returns a PM-grade summary + metadata.
 */
export async function analyzeProject(projectPath) {
  const allFiles = await listFiles(projectPath);
  const fileExtensions = new Set(allFiles.map(f => extname(f).toLowerCase()));
  const fileCount = allFiles.length;

  // Read priority files first
  const priorityContents = {};
  let totalChars = 0;
  for (const fileName of PRIORITY_FILES) {
    const match = allFiles.find(f => basename(f) === fileName);
    if (match && totalChars < MAX_TOTAL_CHARS) {
      const content = await safeReadFile(match);
      if (content) {
        priorityContents[fileName] = content;
        totalChars += content.length;
      }
    }
  }

  // Sample key source files (shallower depth = higher priority entry points)
  const codeFiles = allFiles
    .filter(f => CODE_EXTENSIONS.has(extname(f).toLowerCase()))
    .filter(f => !basename(f).match(/\.(test|spec|min)\./))
    .sort((a, b) => a.split('/').length - b.split('/').length)
    .slice(0, MAX_CODE_FILES);

  const codeContents = {};
  for (const f of codeFiles) {
    if (totalChars >= MAX_TOTAL_CHARS) break;
    const content = await safeReadFile(f);
    if (content.length > 100) {
      const relPath = relative(projectPath, f);
      codeContents[relPath] = content;
      totalChars += content.length;
    }
  }

  const pkgData = priorityContents['package.json']
    ? parsePackageJson(priorityContents['package.json'])
    : null;

  const techStack      = detectTechStack(pkgData, fileExtensions);
  const dirTree        = await buildDirectoryTree(projectPath, 3);
  const projectName    = pkgData?.name ?? basename(projectPath);
  const description    = pkgData?.description ?? '';
  const keywords       = pkgData?.keywords ?? [];
  const researchQueries = generateResearchQueries(projectName, description, techStack, keywords);

  const readmeContent = priorityContents['README.md']
    ?? priorityContents['README.rst']
    ?? '';

  const summary = composeSummary({
    projectName, description, techStack, dirTree, pkgData,
    readmeContent, codeContents, fileCount, projectPath,
  });

  return { projectName, summary, techStack, researchQueries, description, fileCount, keyFiles: Object.keys(codeContents) };
}

/**
 * Re-analyzes the project for a sync operation (includes a "since last sync" header).
 */
export async function syncProject(projectPath, previousConfig) {
  const result   = await analyzeProject(projectPath);
  const lastSync = previousConfig?.sync?.last_synced ?? null;
  const header   = lastSync
    ? `_Sync update — previous: ${lastSync} | now: ${new Date().toISOString()}_\n\n`
    : `_Full sync (no previous sync record)_\n\n`;

  return {
    updatedSummary:  header + result.summary,
    researchQueries: result.researchQueries,
    fileCount:       result.fileCount,
    lastSync:        new Date().toISOString(),
    projectName:     result.projectName,
    description:     result.description,
  };
}
