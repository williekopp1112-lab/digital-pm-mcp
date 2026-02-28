import { request as httpsRequest } from 'https';

const USER_AGENT         = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const DDG_HTML_HOST      = 'html.duckduckgo.com';
const DDG_MAIN_HOST      = 'duckduckgo.com';
const DDG_PATH           = '/html/';
const MAX_RESULTS        = 5;
const REQUEST_DELAY_MS   = 1500;
const REQUEST_TIMEOUT_MS = 12_000;

// ── Cookie initialization ─────────────────────────────────────────────────────

let _ddgCookies = null;

/**
 * Fetch DDG's homepage to capture the cookies they set (ddgAtb, etc.).
 * These cookies help avoid DDG's bot-detection on subsequent search requests.
 * Cached for the lifetime of the process — one fetch per session is enough.
 */
async function getDDGCookies() {
  if (_ddgCookies !== null) return _ddgCookies;

  return new Promise((resolve) => {
    const req = httpsRequest({
      hostname: DDG_MAIN_HOST,
      path:     '/',
      method:   'GET',
      headers: {
        'User-Agent':      USER_AGENT,
        'Accept':          'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
      },
      timeout: REQUEST_TIMEOUT_MS,
    }, (res) => {
      _ddgCookies = (res.headers['set-cookie'] || [])
        .map(c => c.split(';')[0])
        .join('; ');
      res.resume(); // consume body so the socket is released
      resolve(_ddgCookies);
    });

    req.on('error',   () => { _ddgCookies = ''; resolve(''); }); // non-critical
    req.on('timeout', () => { req.destroy(); _ddgCookies = ''; resolve(''); });
    req.end();
  });
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

/**
 * HTTP POST to DDG's HTML-only endpoint.
 * DDG's html endpoint prefers POST (GET can return a bot-challenge page).
 */
function postDDG(query, cookies) {
  return new Promise((resolve, reject) => {
    const bodyStr = new URLSearchParams({ q: query, kl: 'us-en', b: '' }).toString();
    const bodyBuf = Buffer.from(bodyStr, 'utf8');

    const headers = {
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
    };
    if (cookies) headers['Cookie'] = cookies;

    const options = {
      hostname: DDG_HTML_HOST,
      path:     DDG_PATH,
      method:   'POST',
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    };

    const req = httpsRequest(options, (res) => {
      // DDG occasionally redirects POSTs — follow once
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location;
        res.resume();
        const getReq = httpsRequest(
          loc.startsWith('/') ? `https://${DDG_HTML_HOST}${loc}` : loc,
          { method: 'GET', headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html', 'Accept-Encoding': 'identity', ...(cookies ? { Cookie: cookies } : {}) }, timeout: REQUEST_TIMEOUT_MS },
          (res2) => {
            let data = '';
            res2.setEncoding('utf8');
            res2.on('data', c => { data += c; });
            res2.on('end', () => resolve(data));
          }
        );
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

/**
 * Fallback: GET request to the same HTML endpoint.
 * Sometimes GET works when POST is blocked.
 */
function getDDG(query, cookies) {
  const qs = new URLSearchParams({ q: query, kl: 'us-en' }).toString();
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent':      USER_AGENT,
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
      'Referer':         'https://duckduckgo.com/',
    };
    if (cookies) headers['Cookie'] = cookies;

    const req = httpsRequest({
      hostname: DDG_HTML_HOST,
      path:     `${DDG_PATH}?${qs}`,
      method:   'GET',
      headers,
      timeout:  REQUEST_TIMEOUT_MS,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('GET timeout')); });
    req.end();
  });
}

// ── DDG URL extractor ────────────────────────────────────────────────────────

/**
 * DDG HTML results wrap real URLs in redirect links:
 *   href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com&..."
 * This extracts the real destination URL from the `uddg` param.
 */
function extractRealUrl(ddgHref) {
  try {
    const full = ddgHref.startsWith('//') ? `https:${ddgHref}` : ddgHref;
    const u    = new URL(full);
    const uddg = u.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
  } catch { /* fall through */ }
  return null;
}

// ── DDG HTML parser ──────────────────────────────────────────────────────────

function parseDDGResults(html) {
  const results = [];

  // DDG HTML endpoint wraps each result in <div class="result ...">
  // Result links:  <a class="result__a" href="//duckduckgo.com/l/?uddg=...">Title</a>
  // Snippets:      <a class="result__snippet" ...>snippet text</a>

  const linkRe    = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]{1,150}?)<\/a>/g;
  const snippetRe = /class="result__snippet"[^>]*>([\s\S]{0,400}?)<\/a>/g;

  const links    = [...html.matchAll(linkRe)];
  const snippets = [...html.matchAll(snippetRe)];

  for (let i = 0; i < Math.min(links.length, MAX_RESULTS); i++) {
    const rawHref = links[i][1];
    const title   = links[i][2]
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'")
      .trim();

    const url = extractRealUrl(rawHref);
    if (!url || url.includes('duckduckgo.com')) continue;

    const snip = snippets[i]
      ? snippets[i][1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim()
      : '';

    results.push({ url, title, description: snip });
  }

  // Broad fallback: scan for any non-DDG HTTPS link if primary regex found nothing
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
 * Tries POST first (with cookies), then falls back to GET.
 * Never throws — returns an empty array on total failure (callers handle fallback).
 */
export async function searchTopic(query) {
  const cookies = await getDDGCookies();

  // Attempt 1: POST with cookies
  try {
    const html    = await postDDG(query, cookies);
    const results = parseDDGResults(html);
    if (results.length > 0) return results;
    process.stderr.write(`[digital-pm-mcp] DDG POST returned no results for "${query}" — trying GET fallback\n`);
  } catch (err) {
    process.stderr.write(`[digital-pm-mcp] DDG POST failed for "${query}": ${err.message} — trying GET fallback\n`);
  }

  // Attempt 2: GET fallback
  try {
    const html    = await getDDG(query, cookies);
    const results = parseDDGResults(html);
    if (results.length > 0) return results;
    process.stderr.write(`[digital-pm-mcp] DDG GET also returned no results for "${query}" (${html.length} chars)\n`);
  } catch (err) {
    process.stderr.write(`[digital-pm-mcp] DDG GET also failed for "${query}": ${err.message}\n`);
  }

  // Both attempts failed — return empty so callers can skip this topic gracefully
  return [];
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
