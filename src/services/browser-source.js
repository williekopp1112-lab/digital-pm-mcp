/**
 * browser-source.js
 *
 * Drives NotebookLM via browser automation (patchright).
 * Uses launchPersistentContext with the notebooklm-mcp Chrome profile —
 * the same authenticated profile the user already set up via notebooklm-mcp.
 * If that profile is locked (concurrent use), clones it to an isolated temp dir.
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

// ── Path helpers ──────────────────────────────────────────────────────────────

function getAppSupportDir() {
  if (process.platform === 'darwin')  return path.join(os.homedir(), 'Library', 'Application Support');
  if (process.platform === 'win32')   return process.env.APPDATA || os.homedir();
  return path.join(os.homedir(), '.local', 'share');
}

/** notebooklm-mcp's Chrome profile — already authenticated by the user */
function getNotebookLMChromeProfile() {
  return path.join(getAppSupportDir(), 'notebooklm-mcp', 'chrome_profile');
}

/** Where digital-pm-mcp stores its cloned isolated profile instances */
function getDigitalPMInstancesDir() {
  return path.join(getAppSupportDir(), 'digital-pm-mcp', 'chrome_profile_instances');
}

// ── Find patchright from local deps or notebooklm-mcp's npx cache ────────────

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

// ── Persistent context helper ─────────────────────────────────────────────────
// Uses launchPersistentContext with the notebooklm-mcp Chrome profile.
// If that profile is locked by another process, clones it into an isolated dir.

const TIMEOUT = 30_000; // 30s per UI step

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
];

/**
 * Returns an open persistent browser context and (if we created a temp clone)
 * the path to the temp dir so it can be cleaned up after use.
 *
 * @returns {{ context: BrowserContext, tempDir: string|null }}
 */
async function openPersistentContext(headless = true) {
  const patchright  = await getPatchright();
  const baseProfile = getNotebookLMChromeProfile();

  const launchOptions = {
    headless,
    args: LAUNCH_ARGS,
  };

  // First attempt: use the base notebooklm-mcp profile directly
  try {
    const context = await patchright.chromium.launchPersistentContext(baseProfile, launchOptions);
    return { context, tempDir: null };
  } catch (err) {
    const isSingleton = /ProcessSingleton|SingletonLock|profile is already in use/i.test(
      String(err?.message || err)
    );
    if (!isSingleton) throw err;

    // Profile is locked — clone it into an isolated instance dir
    process.stderr.write('[digital-pm-mcp] Chrome profile in use, cloning to isolated instance...\n');

    const stamp      = `${process.pid}-${Date.now()}`;
    const instancesDir = getDigitalPMInstancesDir();
    const tempDir    = path.join(instancesDir, `instance-${stamp}`);

    await fs.mkdir(tempDir, { recursive: true });

    // Best-effort clone — skip lock/tmp files so Chrome can open the copy cleanly
    try {
      await fs.cp(baseProfile, tempDir, {
        recursive:    true,
        errorOnExist: false,
        force:        true,
        filter: (src) => {
          const bn = path.basename(src);
          return !/^Singleton/i.test(bn) && !bn.endsWith('.lock') && !bn.endsWith('.tmp');
        },
      });
    } catch (cpErr) {
      process.stderr.write(`[digital-pm-mcp] Profile clone warning: ${cpErr.message}\n`);
      // Continue with the (possibly partial) clone
    }

    const context = await patchright.chromium.launchPersistentContext(tempDir, launchOptions);
    return { context, tempDir };
  }
}

// ── Browser helper ────────────────────────────────────────────────────────────

async function withNotebookPage(notebookUrl, fn) {
  const { context, tempDir } = await openPersistentContext();

  try {
    const page = await context.newPage();

    // Navigate to notebook
    await page.goto(notebookUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

    // Wait for the chat input to confirm we're authenticated and the notebook is ready
    await page.waitForSelector('textarea.query-box-input', { timeout: TIMEOUT, state: 'visible' });

    // Allow Angular/Material animations to settle (new notebooks auto-open "Add sources" modal)
    await page.waitForTimeout(1500);

    return await fn(page);
  } finally {
    await context.close();
    // Clean up isolated clone if we created one
    if (tempDir) {
      try { await fs.rm(tempDir, { recursive: true, force: true }); } catch {}
    }
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
  const { context, tempDir } = await openPersistentContext();

  try {
    const page = await context.newPage();

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

    // Poll until the page URL becomes a real /notebook/<uuid> URL.
    // NotebookLM briefly shows /notebook/creating as an intermediate URL
    // before assigning the permanent UUID — skip that transient state.
    const deadline = Date.now() + TIMEOUT;
    let notebookUrl = null;
    while (Date.now() < deadline) {
      await page.waitForTimeout(500);
      const url = page.url();
      if (url.includes('/notebook/') && !url.includes('/notebook/creating')) {
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
    await context.close();
    if (tempDir) {
      try { await fs.rm(tempDir, { recursive: true, force: true }); } catch {}
    }
  }
}

// ── Dismiss any blocking overlay (e.g. onboarding dialog on new notebooks) ────

async function dismissBlockingOverlay(page) {
  // Check if the cdk-overlay-backdrop is blocking interactions
  const backdropVisible = await page.evaluate(() => {
    const backdrop = document.querySelector('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing');
    if (!backdrop) return false;
    // Try to close any open dialog via its close button or by pressing Escape
    const closeBtn = document.querySelector('.cdk-overlay-container button[aria-label="Close"]');
    if (closeBtn) { closeBtn.click(); return true; }
    return true; // backdrop exists but no close button — will press Escape
  });

  if (backdropVisible) {
    // Press Escape to close modal dialogs
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);

    // Wait for backdrop to disappear
    try {
      await page.waitForSelector('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing', {
        timeout: 5000,
        state:   'hidden',
      });
    } catch { /* backdrop may have already gone */ }
  }
}

// ── Open the "Add sources" dialog ─────────────────────────────────────────────

async function openAddSourcesDialog(page) {
  // On newly created notebooks NotebookLM auto-opens the "Add sources" dialog,
  // which puts up a backdrop that blocks the "Add source" sidebar button.
  // Detect the backdrop: if it's present the dialog is already open.
  const backdropPresent = await page.evaluate(() =>
    !!document.querySelector('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing')
  );

  if (!backdropPresent) {
    // Dialog is not open — click the "+ Add sources" button to open it
    await page.waitForSelector('button[aria-label="Add source"]', { timeout: TIMEOUT, state: 'visible' });
    await page.click('button[aria-label="Add source"]');
  }

  // Wait for the source-type buttons (Copied text, Websites, etc.)
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
