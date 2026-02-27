import { spawn } from 'child_process';
import { createInterface } from 'readline';

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
      if (!trimmed) return; // skip blank lines (matches willieOS mcp.rs behavior)
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
 * Ported from willieOS src-tauri/src/mcp.rs (run_mcp_session_owned).
 *
 * @param {string} toolName  - e.g. 'ask_question'
 * @param {object} toolArgs  - e.g. { question: '...', notebook_url: '...' }
 * @returns {Promise<string>}
 */
export async function callNotebookLM(toolName, toolArgs) {
  const child = spawn('npx', ['notebooklm-mcp@latest'], {
    env:   { ...process.env, PATH: getAugmentedPath() },
    stdio: ['pipe', 'pipe', 'ignore'], // ignore stderr — notebooklm-mcp logs heavily to it
    shell: false,
  });

  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const cleanup = () => { try { child.kill(); } catch { /* ignore */ } };

  try {
    // ── 1. Initialize ──────────────────────────────────────────────────────
    sendRpc(child.stdin, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'digital-pm-mcp', version: '0.1.0' },
      },
    });

    const initResp = await readRpcResponse(rl, HANDSHAKE_TIMEOUT_MS);
    if (initResp.error) {
      throw new Error(`MCP initialize failed: ${JSON.stringify(initResp.error)}`);
    }

    // ── 2. Send initialized notification (NO id — it's a notification) ────
    sendRpc(child.stdin, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    });

    // ── 3. Call the tool ───────────────────────────────────────────────────
    sendRpc(child.stdin, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: toolName, arguments: toolArgs },
    });

    const toolResp = await readRpcResponse(rl, TOOL_TIMEOUT_MS);
    if (toolResp.error) {
      throw new Error(`tools/call error: ${JSON.stringify(toolResp.error)}`);
    }

    // ── 4. Extract text content ────────────────────────────────────────────
    const content = toolResp?.result?.content;
    if (Array.isArray(content)) {
      return content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n');
    }
    return JSON.stringify(toolResp?.result ?? toolResp);

  } finally {
    cleanup();
    rl.close();
  }
}
