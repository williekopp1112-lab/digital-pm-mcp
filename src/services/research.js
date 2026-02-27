import { request as httpsRequest } from 'https';

const USER_AGENT         = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const DDG_HOST           = 'html.duckduckgo.com';
const DDG_PATH           = '/html/';
const MAX_RESULTS        = 5;
const REQUEST_DELAY_MS   = 1500;
const REQUEST_TIMEOUT_MS = 12_000;

// ── HTTP POST helper ─────────────────────────────────────────────────────────

/**
 * HTTP POST to DDG HTML endpoint.
 * DDG's html endpoint requires POST (GET returns bot-challenge page).
 */
function postDDG(query) {
  return new Promise((resolve, reject) => {
    const bodyStr = new URLSearchParams({ q: query, kl: 'us-en', b: '' }).toString();
    const bodyBuf = Buffer.from(bodyStr, 'utf8');

    const options = {
      hostname: DDG_HOST,
      path:     DDG_PATH,
      method:   'POST',
      headers: {
        'Content-Type':     'application/x-www-form-urlencoded',
        'Content-Length':   bodyBuf.length,
        'User-Agent':       USER_AGENT,
        'Accept':           'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language':  'en-US,en;q=0.9',
        'Accept-Encoding':  'identity',
        'Cache-Control':    'no-cache',
        'Pragma':           'no-cache',
        'Origin':           'https://duckduckgo.com',
        'Referer':          'https://duckduckgo.com/',
      },
      timeout: REQUEST_TIMEOUT_MS,
    };

    const req = httpsRequest(options, (res) => {
      // DDG can redirect POSTs to GET — follow once
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location;
        // consume body to free socket
        res.resume();
        // Simple GET follow
        const getReq = httpsRequest(loc.startsWith('/') ? `https://${DDG_HOST}${loc}` : loc, {
          method: 'GET',
          headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html', 'Accept-Encoding': 'identity' },
          timeout: REQUEST_TIMEOUT_MS,
        }, (res2) => {
          let data = '';
          res2.setEncoding('utf8');
          res2.on('data', c => { data += c; });
          res2.on('end', () => resolve(data));
        });
        getReq.on('error', reject);
        getReq.on('timeout', () => { getReq.destroy(); reject(new Error('Timeout on redirect')); });
        getReq.end();
        return;
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(bodyBuf);
    req.end();
  });
}

// ── DDG URL extractor ────────────────────────────────────────────────────────

/**
 * DDG HTML results wrap real URLs in redirect links:
 *   href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com&..."
 * This extracts the real destination URL from `uddg` param.
 */
function extractRealUrl(ddgHref) {
  try {
    // Normalise: add protocol if missing
    const full = ddgHref.startsWith('//') ? `https:${ddgHref}` : ddgHref;
    const u    = new URL(full);
    const uddg = u.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    // If no uddg param, return as-is if it's a real http URL
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
  } catch { /* fall through */ }
  return null;
}

// ── DDG HTML parser ──────────────────────────────────────────────────────────

function parseDDGResults(html) {
  const results = [];

  // DDG HTML endpoint wraps each result in <div class="result ...">
  // Result links:    <a class="result__a" href="//duckduckgo.com/l/?uddg=...">Title</a>
  // Snippet links:   <a class="result__snippet" ...>snippet text</a>

  const linkRe    = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]{1,150}?)<\/a>/g;
  const snippetRe = /class="result__snippet"[^>]*>([\s\S]{0,400}?)<\/a>/g;

  const links    = [...html.matchAll(linkRe)];
  const snippets = [...html.matchAll(snippetRe)];

  for (let i = 0; i < Math.min(links.length, MAX_RESULTS); i++) {
    const rawHref = links[i][1];
    const title   = links[i][2]
      .replace(/<[^>]+>/g, '')     // strip inner HTML tags
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'")
      .trim();

    const url = extractRealUrl(rawHref);
    if (!url || url.includes('duckduckgo.com')) continue;

    const snip = snippets[i]
      ? snippets[i][1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim()
      : '';

    results.push({ url, title, description: snip });
  }

  // Fallback: if primary regex missed, try broad href scan for non-DDG HTTPS URLs
  if (results.length === 0) {
    const broad = /href="(https?:\/\/(?!(?:www\.)?duckduckgo\.com)[^"]{10,300})"/g;
    for (const m of html.matchAll(broad)) {
      if (results.length >= MAX_RESULTS) break;
      results.push({ url: m[1], title: m[1], description: '' });
    }
  }

  return results;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Search DuckDuckGo for a single query string.
 * Never throws — returns a manual search link on any failure.
 */
export async function searchTopic(query) {
  try {
    const html    = await postDDG(query);
    const results = parseDDGResults(html);
    if (results.length > 0) return results;
    process.stderr.write(`[digital-pm-mcp] DDG returned no parseable results for "${query}" (${html.length} chars)\n`);
  } catch (err) {
    process.stderr.write(`[digital-pm-mcp] research search failed for "${query}": ${err.message}\n`);
  }
  // Graceful fallback — give Claude a clickable search link
  return [{
    url:         `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
    title:       `Search: ${query}`,
    description: 'Auto-fetch failed or returned no results — click to search manually.',
  }];
}

/**
 * Search multiple topics sequentially with a polite delay between requests.
 */
export async function searchTopics(topics) {
  const all = [];
  for (let i = 0; i < topics.length; i++) {
    const results = await searchTopic(topics[i]);
    all.push({ topic: topics[i], results });
    if (i < topics.length - 1) {
      await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
    }
  }
  return all;
}
