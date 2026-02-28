import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { addTextSource as _addTextSource, addUrlSources as _addUrlSources, createNotebook as _createNotebook } from './browser-source.js';

const HANDSHAKE_TIMEOUT_MS = 15_000;
const TOOL_TIMEOUT_MS      = 120_000; // Browser automation can be slow

// ── PATH augmentation ────────────────────────────────────────────────────────
// MCP servers may be launched without a full shell PATH.
// We augment it so npx/node can be found regardless.

function getAugmentedPath() {
  const base  = process.env.PATH ?? '';
  const extra = '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/local/sbin:/opt/homebrew/sbin';
  return base ? `${base}:${extra}` : extra;
}

// ── JSON-RPC helpers ─────────────────────────────────────────────────────────

function sendRpc(stdin, msg) {
  stdin.write(JSON.stringify(msg) + '\n');
}

function readRpcResponse(rl, timeoutMs = TOOL_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`RPC timeout after ${timeoutMs}ms — is notebooklm-mcp authenticated?`)),
      timeoutMs
    );
    const handler = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      clearTimeout(timer);
      rl.removeListener('line', handler);
      try {
        resolve(JSON.parse(trimmed));
      } catch (err) {
        reject(new Error(`JSON parse error: ${err.message} — raw: ${trimmed.slice(0, 300)}`));
      }
    };
    rl.on('line', handler);
  });
}

// ── Main subprocess client ───────────────────────────────────────────────────

/**
 * Spawns notebooklm-mcp as a subprocess, performs the MCP handshake,
 * calls a tool, and returns the text result.
 *
 * @param {string} toolName  - e.g. 'ask_question'
 * @param {object} toolArgs  - e.g. { question: '...', notebook_url: '...' }
 * @returns {Promise<string>}
 */
export async function callNotebookLM(toolName, toolArgs) {
  const child = spawn('npx', ['notebooklm-mcp@latest'], {
    env:   { ...process.env, PATH: getAugmentedPath() },
    stdio: ['pipe', 'pipe', 'ignore'],
    shell: false,
  });

  const rl      = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const cleanup = () => { try { child.kill(); } catch { /* ignore */ } };

  try {
    sendRpc(child.stdin, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'digital-pm-mcp', version: '0.1.0' },
      },
    });

    const initResp = await readRpcResponse(rl, HANDSHAKE_TIMEOUT_MS);
    if (initResp.error) throw new Error(`MCP initialize failed: ${JSON.stringify(initResp.error)}`);

    sendRpc(child.stdin, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

    sendRpc(child.stdin, {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: toolName, arguments: toolArgs },
    });

    const toolResp = await readRpcResponse(rl, TOOL_TIMEOUT_MS);
    if (toolResp.error) throw new Error(`tools/call error: ${JSON.stringify(toolResp.error)}`);

    const content = toolResp?.result?.content;
    const text = Array.isArray(content)
      ? content.filter(item => item.type === 'text').map(item => item.text).join('\n')
      : JSON.stringify(toolResp?.result ?? toolResp);

    // Detect tool-level auth failure returned as JSON text
    // e.g. notebooklm-mcp returns: {"success":false,"error":"Failed to authenticate session"}
    if (text.trim().startsWith('{')) {
      let parsed;
      try { parsed = JSON.parse(text.trim()); } catch { /* not JSON — continue */ }
      if (parsed && parsed.success === false && typeof parsed.error === 'string') {
        throw new Error(parsed.error);
      }
    }

    return text;

  } finally {
    cleanup();
    rl.close();
  }
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
