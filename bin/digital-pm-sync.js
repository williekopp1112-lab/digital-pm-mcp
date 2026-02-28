#!/usr/bin/env node
/**
 * digital-pm-sync — Standalone sync runner for scheduled background syncs
 *
 * Usage:
 *   node digital-pm-sync.js [project-path] [--mode=code|research|both]
 *
 * Reads .digitalpM.json from the project directory, runs the configured sync,
 * and exits. Designed to be called by launchd, cron, or any task scheduler
 * without user interaction.
 *
 * Environment variables (inherit from shell or set in launchd plist):
 *   TAVILY_API_KEY   — required if mode includes research
 */

import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Parse args ────────────────────────────────────────────────────────────────

const args       = process.argv.slice(2);
const modeArg    = args.find(a => a.startsWith('--mode='));
const mode       = modeArg ? modeArg.replace('--mode=', '') : 'both';
const projectArg = args.find(a => !a.startsWith('--'));
const projectPath = projectArg ? resolve(projectArg) : process.cwd();

// ── Run sync ─────────────────────────────────────────────────────────────────

const started = new Date().toISOString();
process.stderr.write(`[digital-pm-sync] ${started} — syncing ${projectPath} (mode: ${mode})\n`);

try {
  const { handleSync } = await import(join(__dirname, '../src/tools/sync.js'));

  const result = await handleSync({ project_path: projectPath, mode });

  const text = result?.content?.find(c => c.type === 'text')?.text ?? '';
  process.stderr.write(`[digital-pm-sync] ✅ Done\n${text.slice(0, 600)}\n`);
  process.exit(0);

} catch (err) {
  process.stderr.write(`[digital-pm-sync] ❌ Failed: ${err.message}\n`);
  process.exit(1);
}
