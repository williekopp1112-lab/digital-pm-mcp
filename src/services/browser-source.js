/**
 * browser-source.js
 *
 * Drives NotebookLM via browser automation (patchright).
 * Reuses the auth cookies already managed by notebooklm-mcp — no separate login needed.
 *
 * Exports:
 *   createNotebook()                             → creates a new notebook, returns its URL
 *   addTextSource(label, content, notebookUrl)   → "Copied text" source
 *   addUrlSources(urls, notebookUrl)             → "Websites" source (batched)
 */

import os   from 'os';
import path  from 'path';
import fs    from 'fs/promises';
import { pathToFileURL } from 'url';

// ── Auth state path (managed by notebooklm-mcp) ──────────────────────────────

function getNotebookLMStateDir() {
  const platform = process.platform;
  if (platform === 'darwin')  return path.join(os.homedir(), 'Library', 'Application Support', 'notebooklm-mcp', 'browser_state');
  if (platform === 'win32')   return path.join(process.env.APPDATA || os.homedir(), 'notebooklm-mcp', 'browser_state');
  return path.join(os.homedir(), '.local', 'share', 'notebooklm-mcp', 'browser_state');
}

async function loadBrowserState() {
  const stateFile = path.join(getNotebookLMStateDir(), 'state.json');
  try {
    const raw = await fs.readFile(stateFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── Find patchright from local deps or notebooklm-mcp's npx cache ────────────
// patchright is already installed by notebooklm-mcp — no separate browser
// download needed. We try local node_modules first, then the npx cache.

let _patchright = null;

async function getPatchright() {
  if (_patchright) return _patchright;

  // 1. Local node_modules (patchright added as a direct dependency)
  const localPath = path.join(
    path.dirname(new URL(import.meta.url).pathname), '..', '..', 'node_modules', 'patchright', 'index.mjs'
  );
  try {
    await fs.access(localPath);
    _patchright = await import(pathToFileURL(localPath).href);
    return _patchright;
  } catch { /* not available locally — fall through */ }

  // 2. Search npx cache (notebooklm-mcp installs patchright there)
  const npxCache = path.join(os.homedir(), '.npm', '_npx');
  try {
    const dirs = await fs.readdir(npxCache);
    for (const dir of dirs) {
      const mjs = path.join(npxCache, dir, 'node_modules', 'patchright', 'index.mjs');
      try {
        await fs.access(mjs);
        _patchright = await import(pathToFileURL(mjs).href);
        return _patchright;
      } catch { /* try next dir */ }
    }
  } catch { /* npx cache not accessible */ }

  throw new Error(
    'patchright not found. Ensure notebooklm-mcp has been run at least once ' +
    '(npx notebooklm-mcp@latest), or add patchright to digital-pm-mcp\'s dependencies.'
  );
}

// ── Browser helper ────────────────────────────────────────────────────────────

const TIMEOUT = 30_000; // 30s per UI step

async function withNotebookPage(notebookUrl, fn) {
  const patchright  = await getPatchright();
  const browserState = await loadBrowserState();

  const launchOpts = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };

  const browser = await patchright.chromium.launch(launchOpts);

  try {
    // Create context — inject saved cookies/localStorage if available
    const ctxOpts = browserState ? { storageState: browserState } : {};
    const context  = await browser.newContext(ctxOpts);
    const page     = await context.newPage();

    // Navigate to notebook
    await page.goto(notebookUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

    // Wait for the chat input to confirm we're authenticated and notebook is ready
    await page.waitForSelector('textarea.query-box-input', { timeout: TIMEOUT, state: 'visible' });

    return await fn(page);
  } finally {
    await browser.close();
  }
}

// ── Create a new notebook ─────────────────────────────────────────────────────

/**
 * Navigates to the NotebookLM home page, clicks "New notebook",
 * waits for the notebook to open, and returns its URL.
 *
 * @returns {Promise<string>} The canonical URL of the newly created notebook
 */
export async function createNotebook() {
  const patchright   = await getPatchright();
  const browserState = await loadBrowserState();

  const browser = await patchright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const ctxOpts = browserState ? { storageState: browserState } : {};
    const context  = await browser.newContext(ctxOpts);
    const page     = await context.newPage();

    // Navigate to the NotebookLM home page
    await page.goto('https://notebooklm.google.com/', {
      waitUntil: 'domcontentloaded',
      timeout:   TIMEOUT,
    });

    // Wait for the Angular SPA to finish rendering
    await page.waitForTimeout(3000);

    // Find and click the "New notebook" button — tolerant of UI variations
    const clicked = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll('button, a, [role="button"], mat-card, .new-notebook-card')
      );
      const target = candidates.find(el => {
        const text = (el.textContent || '').toLowerCase().trim();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        return (
          text === 'new notebook'         ||
          text === 'create notebook'      ||
          text === 'new'                  ||
          aria.includes('new notebook')   ||
          aria.includes('create notebook')
        );
      });
      if (target) { target.click(); return true; }
      return false;
    });

    if (!clicked) {
      throw new Error(
        'Could not find "New notebook" button on notebooklm.google.com. ' +
        'Make sure notebooklm-mcp is authenticated (run setup_auth first).'
      );
    }

    // Poll until the page URL becomes a /notebook/ URL
    const deadline = Date.now() + TIMEOUT;
    let notebookUrl = null;
    while (Date.now() < deadline) {
      await page.waitForTimeout(500);
      const url = page.url();
      if (url.includes('/notebook/')) {
        notebookUrl = url.split('?')[0]; // strip any query params
        break;
      }
    }

    if (!notebookUrl) throw new Error('Timed out waiting for new notebook to open');

    // Wait for the notebook to be fully loaded
    await page.waitForSelector('textarea.query-box-input', {
      timeout: TIMEOUT,
      state:   'visible',
    });

    return notebookUrl;
  } finally {
    await browser.close();
  }
}

// ── Open the "Add sources" dialog ─────────────────────────────────────────────

async function openAddSourcesDialog(page) {
  // Click the "+ Add sources" button
  await page.waitForSelector('button[aria-label="Add source"]', { timeout: TIMEOUT, state: 'visible' });
  await page.click('button[aria-label="Add source"]');

  // Wait for the dialog overlay
  await page.waitForSelector('.cdk-overlay-container button.drop-zone-icon-button', {
    timeout: TIMEOUT,
    state:   'visible',
  });
}

// ── PUBLIC: Add text as a "Copied text" source ────────────────────────────────

/**
 * Adds a block of text as a permanent "Copied text" source in the notebook.
 *
 * @param {string} label       - Short title for the source (≤ 100 chars)
 * @param {string} content     - The text to store as a source
 * @param {string} notebookUrl - NotebookLM notebook share URL
 */
export async function addTextSource(label, content, notebookUrl) {
  // Prepend a heading so the source is identifiable in the sources panel
  const sourceContent = `# ${label}\n\n${content}`;

  await withNotebookPage(notebookUrl, async (page) => {
    await openAddSourcesDialog(page);

    // Click "Copied text"
    await page.evaluate(() => {
      const overlay = document.querySelector('.cdk-overlay-container');
      const btn = Array.from(overlay.querySelectorAll('button.drop-zone-icon-button'))
        .find(b => b.textContent.includes('Copied text'));
      if (!btn) throw new Error('Copied text button not found');
      btn.click();
    });

    // Fill the textarea
    await page.waitForSelector('textarea.copied-text-input-textarea', { timeout: TIMEOUT, state: 'visible' });
    await page.fill('textarea.copied-text-input-textarea', sourceContent);

    // Click Insert
    await page.evaluate(() => {
      const overlay = document.querySelector('.cdk-overlay-container');
      const btn = Array.from(overlay.querySelectorAll('button'))
        .find(b => b.textContent.trim() === 'Insert');
      if (!btn) throw new Error('Insert button not found');
      btn.click();
    });

    // Wait for dialog to close (source is being processed)
    await page.waitForSelector('.cdk-overlay-container button.drop-zone-icon-button', {
      timeout: TIMEOUT,
      state:   'hidden',
    });

    // Small buffer to let NotebookLM register the source
    await page.waitForTimeout(2000);
  });
}

// ── PUBLIC: Add URLs as "Websites" sources ────────────────────────────────────

/**
 * Adds one or more URLs as permanent "Websites" sources in the notebook.
 * NotebookLM will fetch and index the content at each URL.
 *
 * @param {string[]} urls      - Array of URLs to add (one batch per call)
 * @param {string} notebookUrl - NotebookLM notebook share URL
 */
export async function addUrlSources(urls, notebookUrl) {
  if (!urls || urls.length === 0) return;

  // NotebookLM accepts multiple URLs pasted one-per-line
  const urlBlock = urls.join('\n');

  await withNotebookPage(notebookUrl, async (page) => {
    await openAddSourcesDialog(page);

    // Click "Websites"
    await page.evaluate(() => {
      const overlay = document.querySelector('.cdk-overlay-container');
      const btn = Array.from(overlay.querySelectorAll('button.drop-zone-icon-button'))
        .find(b => b.textContent.includes('Websites'));
      if (!btn) throw new Error('Websites button not found');
      btn.click();
    });

    // Fill the URL textarea (placeholder: "Paste any links")
    await page.waitForSelector('.cdk-overlay-container textarea', { timeout: TIMEOUT, state: 'visible' });
    await page.fill('.cdk-overlay-container textarea', urlBlock);

    // Click Insert
    await page.evaluate(() => {
      const overlay = document.querySelector('.cdk-overlay-container');
      const btn = Array.from(overlay.querySelectorAll('button'))
        .find(b => b.textContent.trim() === 'Insert');
      if (!btn) throw new Error('Insert button not found');
      btn.click();
    });

    // Wait for dialog to close
    await page.waitForSelector('.cdk-overlay-container button.drop-zone-icon-button', {
      timeout: TIMEOUT,
      state:   'hidden',
    });

    await page.waitForTimeout(2000);
  });
}
