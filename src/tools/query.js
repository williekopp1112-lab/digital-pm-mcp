import { readConfig, resolveProjectPath } from '../services/config.js';
import { callNotebookLM } from '../services/notebooklm.js';

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

  try {
    const answer = await callNotebookLM('ask_question', {
      question,
      notebook_url: config.notebook_url,
    });

    return {
      content: [{
        type: 'text',
        text: [
          `## 🧠 Digital PM — ${config.project_name}`,
          ``,
          `**Q:** ${question}`,
          ``,
          `---`,
          ``,
          answer,
        ].join('\n'),
      }],
    };

  } catch (err) {
    const isAuthLikely = /auth|login|timeout|session/i.test(err.message);
    return {
      content: [{
        type: 'text',
        text: [
          `## Query Failed`,
          ``,
          `**Error:** ${err.message}`,
          ``,
          isAuthLikely
            ? [
                `This looks like a **notebooklm-mcp authentication issue**. To fix:`,
                `1. Run \`npx notebooklm-mcp@latest\` in a terminal`,
                `2. Use the \`setup_auth\` tool to log in to Google`,
                `3. Try \`digitalPM_query\` again`,
              ].join('\n')
            : `Check that \`notebooklm-mcp\` is installed and authenticated, then try again.`,
        ].join('\n'),
      }],
    };
  }
}
