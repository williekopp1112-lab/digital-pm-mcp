/**
 * research.js — Tavily-powered web search
 *
 * Replaces the old DuckDuckGo HTML scraper (blocked, unreliable) with Tavily,
 * a search API purpose-built for LLM consumption. Returns structured JSON with
 * cited results — no HTML parsing, no cookie juggling, no bot detection.
 *
 * Requires: TAVILY_API_KEY environment variable
 * Free tier: 1,000 searches/month — https://app.tavily.com
 *
 * Add to your MCP config:
 *   "digital-pm-mcp": { "env": { "TAVILY_API_KEY": "tvly-..." } }
 */

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';
const MAX_RESULTS     = 7;
const SEARCH_DEPTH    = 'basic';   // 'advanced' costs 2× credits
const TIMEOUT_MS      = 15_000;

// ── API key helper ────────────────────────────────────────────────────────────

function getTavilyKey() {
  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    throw new Error(
      'TAVILY_API_KEY is not set.\n' +
      'Get a free key (1,000 searches/month) at https://app.tavily.com\n' +
      'Then add it to your MCP config:\n' +
      '  "digital-pm-mcp": { "env": { "TAVILY_API_KEY": "tvly-..." } }\n' +
      'Restart Claude Code after updating the config.'
    );
  }
  return key;
}

// ── Core search ───────────────────────────────────────────────────────────────

/**
 * Search Tavily for a single query.
 * Returns [{url, title, description}] — same shape as the old DDG results
 * so handleResearch needs zero changes.
 *
 * Never throws — returns [] on failure so callers can skip gracefully.
 */
export async function searchTopic(query) {
  const apiKey = getTavilyKey(); // throws if missing — let it propagate up

  try {
    const res = await fetch(TAVILY_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key:      apiKey,
        query,
        search_depth: SEARCH_DEPTH,
        max_results:  MAX_RESULTS,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Tavily ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json();

    return (data.results ?? []).map(r => ({
      url:         r.url,
      title:       r.title   ?? r.url,
      description: (r.content ?? r.snippet ?? '').slice(0, 400),
    }));

  } catch (err) {
    process.stderr.write(`[digital-pm-mcp] Tavily search failed for "${query}": ${err.message}\n`);
    return [];
  }
}

/**
 * Search multiple topics sequentially with a short inter-request pause.
 * Returns [{ topic, results }] — same shape as before.
 */
export async function searchTopics(topics) {
  const all = [];
  for (let i = 0; i < topics.length; i++) {
    const results = await searchTopic(topics[i]);
    all.push({ topic: topics[i], results });
    if (i < topics.length - 1) {
      await new Promise(r => setTimeout(r, 400));
    }
  }
  return all;
}
