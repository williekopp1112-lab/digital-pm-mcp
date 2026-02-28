/**
 * version-check.js
 *
 * Checks npm for the latest digital-pm-mcp version at startup.
 * Stores the result globally so tool handlers can prefix a one-time
 * update warning to their response.
 *
 * This is purely advisory — it never blocks or throws.
 */

import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Read local version from package.json ─────────────────────────────────────

function getLocalVersion() {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require(path.join(__dirname, '..', '..', 'package.json'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// ── Semver compare (major.minor.patch only) ───────────────────────────────────

function isNewer(a, b) {
  // Returns true if a > b
  const parse = v => (v || '0.0.0').split('.').map(Number);
  const [aMaj, aMin, aPat] = parse(a);
  const [bMaj, bMin, bPat] = parse(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPat > bPat;
}

// ── Shared state ──────────────────────────────────────────────────────────────

export const LOCAL_VERSION = getLocalVersion();

let _latestVersion = null;
let _checkDone     = false;
let _updateWarning = null;   // set once if an update is available

export function getUpdateWarning() { return _updateWarning; }

// ── Async npm check (fire-and-forget at startup) ──────────────────────────────

export async function checkForUpdates() {
  try {
    const res  = await fetch('https://registry.npmjs.org/digital-pm-mcp/latest', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return;
    const data = await res.json();
    _latestVersion = data.version || null;
    _checkDone     = true;

    if (_latestVersion && isNewer(_latestVersion, LOCAL_VERSION)) {
      _updateWarning = [
        `⚠️  **digital-pm-mcp update available: v${LOCAL_VERSION} → v${_latestVersion}**`,
        `   Restart with the latest: update your MCP config to use \`npx digital-pm-mcp@latest\``,
        `   or run: \`npm install -g digital-pm-mcp@latest\``,
      ].join('\n');
      process.stderr.write(`[digital-pm-mcp] Update available: ${LOCAL_VERSION} → ${_latestVersion}\n`);
    }
  } catch {
    // Network unavailable or timeout — silently ignore
  }
}

// ── Helper for tool handlers ──────────────────────────────────────────────────

/**
 * Returns the pending update banner string (if any) and clears it so it only
 * shows once per session. Returns null if no update is available.
 *
 * @returns {string|null} Banner text, or null if up to date
 */
export function withUpdateBanner(_ignored) {
  if (!_updateWarning) return null;
  const banner = _updateWarning;
  _updateWarning = null; // show only once per session
  return banner;
}
