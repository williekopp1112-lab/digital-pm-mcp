import { readConfig, resolveProjectPath } from '../services/config.js';
import { callNotebookLM } from '../services/notebooklm.js';

const MAX_RETRIES    = 3;
const RETRY_DELAY_MS = 2_500;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isAuthError(msg) {
  return /auth|login|session|authenticate/i.test(msg);
}

export async function handleQuery({ question, project_path }) {
  const projectPath = resolveProjectPath(project_path);
  const config      = await readConfig(projectPath);

  if (!config) {
    return {
      content: [{
        type: 'text',
        text: `No \`.digitalpM.json\` found at \`${projectPath}\`.\nRun \`digitalPM_init\` first to set up your digital PM notebook.`,
      }],
    };
  }

  if (!config.notebook_url) {
    return {
      content: [{
        type: 'text',
        text: `No \`notebook_url\` in \`.digitalpM.json\`.\nRun \`digitalPM_init(notebook_url="<url>")\` to link your NotebookLM notebook.`,
      }],
    };
  }

  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const answer = await callNotebookLM('ask_question', {
        question,
        notebook_url: config.notebook_url,
      });

      // Success — include retry info if we had to retry
      const retryNote = attempt > 1 ? `\n> _(Succeeded on attempt ${attempt} of ${MAX_RETRIES})_\n` : '';
      return {
        content: [{
          type: 'text',
          text: [
            `## 🧠 Digital PM — ${config.project_name}`,
            retryNote,
            `**Q:** ${question}`,
            ``,
            `---`,
            ``,
            answer,
          ].join('\n'),
        }],
      };

    } catch (err) {
      lastErr = err;
      const shouldRetry = isAuthError(err.message) && attempt < MAX_RETRIES;
      process.stderr.write(
        `[digital-pm-mcp] Query attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}` +
        (shouldRetry ? ` — retrying in ${RETRY_DELAY_MS}ms…\n` : '\n')
      );
      if (shouldRetry) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      break;
    }
  }

  // All attempts exhausted
  const authIssue = isAuthError(lastErr.message);
  return {
    content: [{
      type: 'text',
      text: [
        `## ⚠️ Digital PM Query Unavailable`,
        ``,
        `Failed after ${MAX_RETRIES} attempts: **${lastErr.message}**`,
        ``,
        authIssue
          ? [
              `This is a **notebooklm-mcp session issue**. Quick fix:`,
              ``,
              `\`\`\``,
              `npx notebooklm-mcp@latest`,
              `# then use the setup_auth tool to re-authenticate`,
              `\`\`\``,
              ``,
              `Once re-authenticated, restart Claude Code and try again.`,
            ].join('\n')
          : `Make sure \`notebooklm-mcp\` is installed and your Google session is active, then try again.`,
      ].join('\n'),
    }],
  };
}
