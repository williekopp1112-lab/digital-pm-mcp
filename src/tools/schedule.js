/**
 * digitalPM_schedule — Install autonomous background sync
 *
 * On macOS: writes a launchd plist and loads it so the project syncs
 *   automatically on the configured schedule, even when Claude is closed.
 *
 * On other platforms: returns exact crontab instructions.
 *
 * Schedule is stored in .digitalpM.json so it's documented with the project.
 *
 * Usage:
 *   digitalPM_schedule()                          — daily at 9am (default)
 *   digitalPM_schedule(interval="hourly")         — every hour
 *   digitalPM_schedule(interval="daily", hour=7)  — daily at 7am
 *   digitalPM_schedule(interval="weekly", hour=9) — every Monday at 9am
 *   digitalPM_schedule(disable=true)              — remove the scheduled job
 */

import os            from 'os';
import path          from 'path';
import fs            from 'fs/promises';
import { execFile }  from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

import { readConfig, writeConfig, resolveProjectPath } from '../services/config.js';

const execFileAsync = promisify(execFile);
const __dirname     = path.dirname(fileURLToPath(import.meta.url));

// ── Paths ─────────────────────────────────────────────────────────────────────

const LAUNCH_AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const SYNC_SCRIPT       = path.join(__dirname, '..', '..', 'bin', 'digital-pm-sync.js');

function plistLabel(projectName) {
  const safe = projectName.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
  return `com.digital-pm-mcp.sync.${safe}`;
}

function plistPath(label) {
  return path.join(LAUNCH_AGENTS_DIR, `${label}.plist`);
}

// ── macOS launchd plist builder ───────────────────────────────────────────────

function buildPlist({ label, nodePath, syncScript, projectPath, interval, hour, mode, tavilyKey }) {
  const envBlock = tavilyKey
    ? `\n\t<key>EnvironmentVariables</key>\n\t<dict>\n\t\t<key>TAVILY_API_KEY</key>\n\t\t<string>${tavilyKey}</string>\n\t</dict>`
    : '';

  let intervalBlock;
  if (interval === 'hourly') {
    intervalBlock = `\n\t<key>StartInterval</key>\n\t<integer>3600</integer>`;
  } else if (interval === 'weekly') {
    intervalBlock = [
      `\n\t<key>StartCalendarInterval</key>`,
      `\t<dict>`,
      `\t\t<key>Weekday</key><integer>1</integer>`,   // Monday
      `\t\t<key>Hour</key><integer>${hour}</integer>`,
      `\t\t<key>Minute</key><integer>0</integer>`,
      `\t</dict>`,
    ].join('\n');
  } else {
    // daily (default)
    intervalBlock = [
      `\n\t<key>StartCalendarInterval</key>`,
      `\t<dict>`,
      `\t\t<key>Hour</key><integer>${hour}</integer>`,
      `\t\t<key>Minute</key><integer>0</integer>`,
      `\t</dict>`,
    ].join('\n');
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t<string>${label}</string>

\t<key>ProgramArguments</key>
\t<array>
\t\t<string>${nodePath}</string>
\t\t<string>${syncScript}</string>
\t\t<string>${projectPath}</string>
\t\t<string>--mode=${mode}</string>
\t</array>
${intervalBlock}${envBlock}

\t<key>StandardOutPath</key>
\t<string>${os.tmpdir()}/digital-pm-mcp-sync.log</string>

\t<key>StandardErrorPath</key>
\t<string>${os.tmpdir()}/digital-pm-mcp-sync.log</string>

\t<key>RunAtLoad</key>
\t<false/>
</dict>
</plist>
`;
}

// ── Disable helper ────────────────────────────────────────────────────────────

async function disableSchedule(label, projectPath, projectName) {
  const plist = plistPath(label);
  let unloaded = false;

  try {
    await execFileAsync('launchctl', ['unload', plist]);
    unloaded = true;
  } catch { /* might not be loaded */ }

  try {
    await fs.rm(plist, { force: true });
  } catch { /* might not exist */ }

  // Remove schedule from config
  await writeConfig(projectPath, { schedule: { enabled: false } });

  return {
    content: [{
      type: 'text',
      text: [
        `## ✅ Schedule Disabled — ${projectName}`,
        ``,
        unloaded
          ? `Removed launchd job and plist: \`${plist}\``
          : `Plist removed (was not loaded): \`${plist}\``,
        ``,
        `Run \`digitalPM_schedule()\` to re-enable.`,
      ].join('\n'),
    }],
  };
}

// ── Cron instructions (non-macOS) ─────────────────────────────────────────────

function cronInstructions({ nodePath, syncScript, projectPath, interval, hour, mode }) {
  const cronExpr = interval === 'hourly'
    ? `0 * * * *`
    : interval === 'weekly'
    ? `0 ${hour} * * 1`
    : `0 ${hour} * * *`; // daily

  const cmd = `${nodePath} ${syncScript} ${projectPath} --mode=${mode}`;
  const logFile = `/tmp/digital-pm-mcp-sync.log`;

  return {
    content: [{
      type: 'text',
      text: [
        `## 📅 Schedule Setup (Linux / Windows)`,
        ``,
        `Automatic launchd scheduling is macOS-only. For other platforms, add this to your crontab:`,
        ``,
        `\`\`\`bash`,
        `# Run: crontab -e  (opens your crontab)`,
        `# Then paste this line:`,
        `${cronExpr} ${cmd} >> ${logFile} 2>&1`,
        `\`\`\``,
        ``,
        `**Cron expression:** \`${cronExpr}\` = ${interval}${interval === 'daily' || interval === 'weekly' ? ` at ${hour}:00` : ''}`,
        ``,
        `If TAVILY_API_KEY isn't in your cron environment, add it:`,
        `\`\`\`bash`,
        `${cronExpr} TAVILY_API_KEY=tvly-... ${cmd} >> ${logFile} 2>&1`,
        `\`\`\``,
      ].join('\n'),
    }],
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handleSchedule({
  interval    = 'daily',
  hour        = 9,
  mode        = 'both',
  project_path,
  disable     = false,
}) {
  const projectPath = resolveProjectPath(project_path);
  const config      = await readConfig(projectPath);

  if (!config) {
    return {
      content: [{
        type: 'text',
        text: `No \`.digitalpM.json\` at \`${projectPath}\`.\nRun \`digitalPM_init\` first.`,
      }],
    };
  }

  const projectName = config.project_name ?? path.basename(projectPath);
  const label       = plistLabel(projectName);

  // ── Disable ────────────────────────────────────────────────────────────────
  if (disable) {
    return disableSchedule(label, projectPath, projectName);
  }

  // ── Non-macOS ──────────────────────────────────────────────────────────────
  if (process.platform !== 'darwin') {
    return cronInstructions({
      nodePath:    process.execPath,
      syncScript:  SYNC_SCRIPT,
      projectPath,
      interval,
      hour,
      mode,
    });
  }

  // ── macOS: write + load launchd plist ─────────────────────────────────────
  try {
    await fs.mkdir(LAUNCH_AGENTS_DIR, { recursive: true });

    const plist = buildPlist({
      label,
      nodePath:   process.execPath,
      syncScript: SYNC_SCRIPT,
      projectPath,
      interval,
      hour,
      mode,
      tavilyKey:  process.env.TAVILY_API_KEY ?? '',
    });

    const plistFile = plistPath(label);

    // Unload existing job if present (ignore errors if not loaded)
    try { await execFileAsync('launchctl', ['unload', plistFile]); } catch { /* ok */ }

    await fs.writeFile(plistFile, plist, 'utf8');
    await execFileAsync('launchctl', ['load', plistFile]);

    // Persist schedule to .digitalpM.json
    await writeConfig(projectPath, {
      schedule: {
        enabled:  true,
        interval,
        hour,
        mode,
        plist:    plistFile,
        installed_at: new Date().toISOString(),
      },
    });

    const humanInterval = interval === 'hourly'
      ? 'every hour'
      : interval === 'weekly'
      ? `every Monday at ${hour}:00`
      : `daily at ${hour}:00`;

    return {
      content: [{
        type: 'text',
        text: [
          `## ✅ Autonomous Sync Scheduled — ${projectName}`,
          ``,
          `**Runs:** ${humanInterval}`,
          `**Syncs:** ${mode === 'both' ? 'codebase + research' : mode}`,
          `**Log:** \`${os.tmpdir()}/digital-pm-mcp-sync.log\``,
          `**Plist:** \`${plistFile}\``,
          ``,
          `The sync runs automatically even when Claude is closed.`,
          `No action required — your Digital PM notebook stays current.`,
          ``,
          `**To remove:** \`digitalPM_schedule(disable=true)\``,
          `**To change:** run \`digitalPM_schedule\` again with new options.`,
        ].join('\n'),
      }],
    };

  } catch (err) {
    return {
      content: [{
        type: 'text',
        text: [
          `## ❌ Schedule Installation Failed`,
          ``,
          `**Error:** ${err.message}`,
          ``,
          `Manual fallback — add this to crontab (\`crontab -e\`):`,
          `\`\`\``,
          `0 ${hour} * * * ${process.execPath} ${SYNC_SCRIPT} ${projectPath} --mode=${mode}`,
          `\`\`\``,
        ].join('\n'),
      }],
    };
  }
}
