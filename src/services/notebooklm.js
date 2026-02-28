import { addTextSource as _addTextSource, addUrlSources as _addUrlSources, createNotebook as _createNotebook, queryNotebook as _queryNotebook } from './browser-source.js';

// ── Main query entry point ───────────────────────────────────────────────────

/**
 * Asks a question to a NotebookLM notebook and returns the AI response text.
 *
 * Previously delegated to a notebooklm-mcp subprocess via JSON-RPC, which meant
 * a separate auth lifecycle we couldn't control. Now drives the NotebookLM UI
 * directly via the same launchPersistentContext used for source injection —
 * same auth path, zero external process, no session expiry surprises.
 *
 * @param {string} toolName  - must be 'ask_question'
 * @param {object} toolArgs  - { question: string, notebook_url: string }
 * @returns {Promise<string>}
 */
export async function callNotebookLM(toolName, toolArgs) {
  if (toolName !== 'ask_question') {
    throw new Error(`callNotebookLM: unsupported tool "${toolName}"`);
  }
  const { question, notebook_url } = toolArgs;
  if (!question)     throw new Error('callNotebookLM: question is required');
  if (!notebook_url) throw new Error('callNotebookLM: notebook_url is required');

  return _queryNotebook(question, notebook_url);
}

// ── Source injection (browser automation) ────────────────────────────────────

/**
 * Adds a block of text as a permanent "Copied text" source in the notebook.
 * This is the primary way to push codebase snapshots, feedback notes,
 * and research summaries into NotebookLM as indexed, queryable knowledge.
 *
 * @param {string} label       - Short title for the source (shown in sources panel)
 * @param {string} content     - Markdown content to store
 * @param {string} notebookUrl - NotebookLM notebook share URL
 */
export async function addTextSource(label, content, notebookUrl) {
  process.stderr.write(`[digital-pm-mcp] Adding text source "${label}" to NotebookLM...\n`);
  await _addTextSource(label, content, notebookUrl);
  process.stderr.write(`[digital-pm-mcp] ✅ Text source "${label}" added.\n`);
}

/**
 * Adds one or more URLs as permanent "Websites" sources in the notebook.
 * NotebookLM fetches and indexes the full content at each URL.
 * Use this for research results — adds the actual web pages as sources,
 * not just summaries.
 *
 * @param {string[]} urls      - URLs to add as sources
 * @param {string} notebookUrl - NotebookLM notebook share URL
 */
export async function addUrlSources(urls, notebookUrl) {
  if (!urls || urls.length === 0) return;
  process.stderr.write(`[digital-pm-mcp] Adding ${urls.length} URL source(s) to NotebookLM...\n`);
  await _addUrlSources(urls, notebookUrl);
  process.stderr.write(`[digital-pm-mcp] ✅ ${urls.length} URL source(s) added.\n`);
}

// ── Notebook creation (browser automation) ───────────────────────────────────

/**
 * Creates a new NotebookLM notebook and returns its URL.
 * Used by digitalPM_init when no notebook URL is provided.
 *
 * @returns {Promise<string>} The URL of the newly created notebook
 */
export async function createNotebook() {
  process.stderr.write('[digital-pm-mcp] Creating new NotebookLM notebook...\n');
  const url = await _createNotebook();
  process.stderr.write(`[digital-pm-mcp] ✅ Notebook created: ${url}\n`);
  return url;
}

// ── Legacy alias (kept for any internal callers) ──────────────────────────────

/**
 * @deprecated Use addTextSource() instead.
 * Previously injected content via the chat interface (ask_question).
 * Now delegates to addTextSource for proper source creation.
 */
export async function injectIntoNotebook(label, content, notebookUrl) {
  return addTextSource(label, content, notebookUrl);
}
