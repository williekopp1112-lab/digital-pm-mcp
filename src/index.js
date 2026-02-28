import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { handleInit }     from './tools/init.js';
import { handleSync }     from './tools/sync.js';
import { handleQuery }    from './tools/query.js';
import { handleResearch } from './tools/research.js';
import { handleFeedback } from './tools/feedback.js';
import { handlePlan }     from './tools/plan.js';

const server = new McpServer({
  name: 'digital-pm-mcp',
  version: '0.4.0',
});

// ── digitalPM_init ────────────────────────────────────────────────────────────
server.registerTool(
  'digitalPM_init',
  {
    title: 'Initialize Digital PM',
    description: [
      'Sets up a NotebookLM digital PM notebook for the current project.',
      '',
      'PHASE A (first run — no notebook_url): Analyzes the codebase, generates a rich',
      'markdown summary, detects the tech stack, and produces research queries.',
      'Returns all content ready for you to paste into a new NotebookLM notebook.',
      '',
      'PHASE B (after creating notebook): Pass notebook_url to save the .digitalpM.json',
      'config file. After this, all other digitalPM tools become available.',
      '',
      'Call once per project to bootstrap. Re-run with notebook_url to complete setup.',
    ].join('\n'),
    inputSchema: {
      project_path:     z.string().optional().describe('Absolute path to project root. Defaults to current working directory.'),
      notebook_url:     z.string().optional().describe('NotebookLM notebook URL. Provide this in Phase B after creating the notebook.'),
      description:      z.string().optional().describe('One-sentence project description. Auto-detected if omitted.'),
      research_topics:  z.array(z.string()).optional().describe('Research topics (competitors, trends). Auto-inferred from codebase if omitted.'),
    },
  },
  handleInit
);

// ── digitalPM_sync ────────────────────────────────────────────────────────────
server.registerTool(
  'digitalPM_sync',
  {
    title: 'Sync Digital PM',
    description: [
      'Re-analyzes the project and returns updated content for the NotebookLM notebook.',
      '',
      'Returns an updated codebase summary and/or new research URLs.',
      'Add the returned content as new sources in NotebookLM to keep the PM current.',
      '',
      'mode options:',
      '  "code"     — re-analyze the codebase only',
      '  "research" — fetch new research URLs only',
      '  "both"     — do both (default)',
    ].join('\n'),
    inputSchema: {
      project_path: z.string().optional().describe('Project root path. Defaults to cwd.'),
      mode:         z.enum(['code', 'research', 'both']).optional().describe('What to sync. Default: "both".'),
    },
  },
  handleSync
);

// ── digitalPM_query ───────────────────────────────────────────────────────────
server.registerTool(
  'digitalPM_query',
  {
    title: 'Query Digital PM',
    description: [
      'Asks a product management question to your project\'s NotebookLM notebook.',
      '',
      'Spawns notebooklm-mcp as a subprocess and routes the question to the notebook.',
      'The notebook_url is loaded automatically from .digitalpM.json.',
      '',
      'Requires notebooklm-mcp to be authenticated.',
      'If not authenticated, run: npx notebooklm-mcp@latest → setup_auth',
      '',
      'Example questions:',
      '  "What features should we build next based on competitor research?"',
      '  "How does our architecture compare to industry standards?"',
      '  "What are users of apps like this asking for most?"',
      '  "What technical debt should we prioritize?"',
    ].join('\n'),
    inputSchema: {
      question:     z.string().describe('The product management question to ask.'),
      project_path: z.string().optional().describe('Project root path. Defaults to cwd.'),
    },
  },
  handleQuery
);

// ── digitalPM_research ────────────────────────────────────────────────────────
server.registerTool(
  'digitalPM_research',
  {
    title: 'Research Market & Competitors',
    description: [
      'Searches the web for competitive and market research on topics related to your project.',
      '',
      'Returns URLs with titles and descriptions ready to add as sources in NotebookLM.',
      'Uses DuckDuckGo — no API key required.',
      '',
      'If topics is not provided, auto-reads research_topics from .digitalpM.json.',
      '',
      'Add the returned URLs to NotebookLM via: "+ Add sources" → "Website"',
    ].join('\n'),
    inputSchema: {
      topics:       z.array(z.string()).optional().describe('Topics to research. Auto-detected from .digitalpM.json if omitted.'),
      project_path: z.string().optional().describe('Project root path. Defaults to cwd.'),
    },
  },
  handleResearch
);

// ── digitalPM_feedback ────────────────────────────────────────────────────────
server.registerTool(
  'digitalPM_feedback',
  {
    title: 'Capture Feedback',
    description: [
      'Formats a piece of user feedback, insight, goal, or market observation as a structured PM note.',
      '',
      'Returns a formatted markdown note. Add it to NotebookLM via:',
      '"+ Add sources" → "Copied text"',
      '',
      'category options:',
      '  feature  — a requested feature or capability',
      '  bug      — a bug or pain point',
      '  insight  — a product or user insight',
      '  goal     — a product goal or north star metric',
      '  market   — a market trend or competitive observation',
    ].join('\n'),
    inputSchema: {
      feedback:     z.string().describe('The feedback, insight, or note to capture.'),
      category:     z.enum(['feature', 'bug', 'insight', 'goal', 'market']).optional().describe('Feedback category. Default: "insight".'),
      project_path: z.string().optional().describe('Project root path. Defaults to cwd.'),
      source:       z.string().optional().describe('Where this feedback came from, e.g. "user interview", "GitHub issue #42".'),
    },
  },
  handleFeedback
);

// ── digitalPM_plan ────────────────────────────────────────────────────────────
server.registerTool(
  'digitalPM_plan',
  {
    title: 'Get JIT Implementation Brief',
    description: [
      'Generates a Just-In-Time implementation brief for a specific feature by querying',
      'the project\'s NotebookLM notebook.',
      '',
      'The brief includes:',
      '  - Recommended technical approach for your stack',
      '  - How top competitors implement this feature (and their gaps)',
      '  - Potential pitfalls and gotchas to avoid',
      '  - What would make your implementation stand out',
      '  - Critical test cases to verify correctness',
      '',
      'Usage: Call this BEFORE starting any feature implementation.',
      'After tests pass, mark the item [x] in ROADMAP.md and discard the brief.',
      '',
      'If the feature is not in ROADMAP.md, this tool will flag it so you can',
      'update the Strategic Epics before coding (Pivot Research protocol).',
    ].join('\n'),
    inputSchema: {
      feature:      z.string().describe('Feature name or description to generate an implementation brief for.'),
      project_path: z.string().optional().describe('Project root path. Defaults to cwd.'),
    },
  },
  handlePlan
);

// ── Start ─────────────────────────────────────────────────────────────────────
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[digital-pm-mcp] v0.4.0 started on stdio\n');
}

runServer().catch((err) => {
  process.stderr.write(`[digital-pm-mcp] Fatal: ${err.message}\n`);
  process.exit(1);
});
