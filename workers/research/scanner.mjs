/**
 * SCANNER — Chief of Research
 *
 * Polls ~40 regulatory sources using four strategies:
 *
 *   ai-scrape   → fetch publications page HTML → Haiku extracts items
 *   gov-uk-atom → parse GOV.UK Atom feed directly (reliable, no AI needed)
 *   api         → call structured API (congress.gov, etc.)
 *   diff        → fetch rolling document → compare hash against ledger
 *
 * Input:   docs/regulator-sources.json   (source definitions)
 *          data/scanner-ledger.json      (tracks seen items per source)
 * Output:  pipeline/discovered/[timestamp].json
 * Model:   Haiku (ai-scrape extraction only)
 * Trigger: Scheduled every 1-4 hours (varies by source priority)
 */

import Parser from 'rss-parser';
import { createHash } from 'crypto';
import { join } from 'path';
import {
  ROOT, DATA, stage,
  readJSON, writeJSON,
  ensureDir, timestampId, log, writeLog
} from '../shared/utils.mjs';
import { call, MODELS } from '../shared/anthropic.mjs';

const SOURCES_FILE = join(ROOT, 'docs', 'regulator-sources.json');
const LEDGER_FILE  = join(DATA, 'scanner-ledger.json');
const WORKER       = 'scanner';

const FETCH_TIMEOUT_MS = 20000;
const HAIKU_SCRAPE_CHARS = 8000; // how much HTML to send to Haiku
const USER_AGENT = 'Mozilla/5.0 (compatible; RegWatch/1.0; regulatory-intelligence-monitor)';

const atomParser = new Parser({ timeout: FETCH_TIMEOUT_MS, headers: { 'User-Agent': USER_AGENT } });

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml,application/xml,*/*' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Strip HTML noise before sending to Haiku — keeps token count low
function cleanHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, HAIKU_SCRAPE_CHARS);
}

// ─── Strategy: ai-scrape ─────────────────────────────────────────────────────

async function scrapeWithAI(source) {
  const html = await fetchPage(source.page_url);
  const clean = cleanHtml(html);

  const systemPrompt = `You extract publication listings from regulatory website pages.
Return ONLY a JSON array. No explanation, no markdown fences.
Each object must have: title (string), url (string, full URL), date (string YYYY-MM-DD or null).
If a URL is relative, prepend the base domain.`;

  const userPrompt = `Base URL: ${source.page_url}

Page content:
${clean}

Extract all publication items visible on this page. Return a JSON array.`;

  const raw = await call({ model: MODELS.haiku, system: systemPrompt, user: userPrompt, maxTokens: 2000 });
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

  let items;
  try {
    items = JSON.parse(cleaned);
  } catch {
    throw new Error(`Haiku returned invalid JSON for ${source.id}`);
  }

  // Ensure full URLs
  return items.map(item => ({
    ...item,
    url: item.url?.startsWith('http') ? item.url : new URL(item.url || '', source.page_url).href
  }));
}

// ─── Strategy: gov-uk-atom ───────────────────────────────────────────────────

async function scrapeGovUkAtom(source) {
  const feed = await atomParser.parseURL(source.feed_url);
  return (feed.items || []).map(item => ({
    title: item.title?.trim() || '',
    url:   item.link || item.guid || '',
    date:  item.isoDate ? item.isoDate.slice(0, 10) : null
  }));
}

// ─── Strategy: api (congress.gov) ────────────────────────────────────────────

async function scrapeApi(source) {
  // Congress.gov API — returns recent bills
  const params = new URLSearchParams(source.api_params || {});
  // Replace placeholder with env var if set
  if (params.get('api_key') === 'CONGRESS_API_KEY') {
    const key = process.env.CONGRESS_API_KEY;
    if (key) params.set('api_key', key);
    else {
      log(WORKER, 'warn', `${source.id}: CONGRESS_API_KEY not set — using DEMO_KEY (rate limited)`);
      params.set('api_key', 'DEMO_KEY');
    }
  }
  params.set('format', 'json');

  const url = `${source.api_url}?${params.toString()}`;
  const body = await fetchPage(url);
  const data = JSON.parse(body);

  const bills = data.bills || data.results || [];
  return bills.map(b => ({
    title: `${b.type || ''} ${b.number || ''}: ${b.title || b.latestAction?.text || ''}`.trim(),
    url:   b.url || `https://www.congress.gov/bill/${b.congress}th-congress/${(b.type||'').toLowerCase()}/${b.number}`,
    date:  b.latestAction?.actionDate || b.updateDate?.slice(0, 10) || null
  }));
}

// ─── Strategy: diff ──────────────────────────────────────────────────────────

async function scrapeDiff(source, seenHash) {
  const body = await fetchPage(source.doc_url);
  const hash = createHash('md5').update(body).digest('hex');

  if (hash === seenHash) return { items: [], hash }; // unchanged

  // Document changed — create one "update" item
  return {
    items: [{
      title: `[UPDATE] ${source.full_name}`,
      url:   source.doc_url,
      date:  new Date().toISOString().slice(0, 10)
    }],
    hash
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runScanner({ dryRun = false } = {}) {
  log(WORKER, 'info', 'Starting scan');

  const sources = readJSON(SOURCES_FILE);
  const ledger  = readJSON(LEDGER_FILE);
  const logEntries  = [];
  const allDiscovered = [];

  for (const source of sources) {
    log(WORKER, 'info', `[${source.strategy}] ${source.id}`);

    const seenIds  = new Set(ledger[source.id]?.seen_ids || []);
    const seenHash = ledger[source.id]?.doc_hash || null;

    let rawItems = [];
    let newHash  = null;

    try {
      if (source.strategy === 'ai-scrape') {
        rawItems = await scrapeWithAI(source);

      } else if (source.strategy === 'gov-uk-atom') {
        rawItems = await scrapeGovUkAtom(source);

      } else if (source.strategy === 'api') {
        rawItems = await scrapeApi(source);

      } else if (source.strategy === 'diff') {
        const result = await scrapeDiff(source, seenHash);
        rawItems = result.items;
        newHash  = result.hash;

      } else {
        log(WORKER, 'warn', `Unknown strategy: ${source.strategy} for ${source.id}`);
        continue;
      }

    } catch (err) {
      log(WORKER, 'error', `${source.id} failed: ${err.message}`);
      logEntries.push({ source: source.id, status: 'error', error: err.message });
      continue;
    }

    // Filter to new items only
    const newItems = rawItems
      .filter(item => item.url && !seenIds.has(item.url))
      .map(item => ({
        id:           `${source.id}-${encodeURIComponent(item.url).slice(0, 60)}`,
        source_id:    source.id,
        source_name:  source.name,
        jurisdiction: source.jurisdiction,
        sectors:      source.sectors,
        title:        item.title || '',
        url:          item.url,
        published:    item.date || new Date().toISOString().slice(0, 10),
        summary:      '',
        discovered_at:new Date().toISOString()
      }));

    if (newItems.length > 0) {
      log(WORKER, 'ok', `${source.id}: ${newItems.length} new item(s)`);
      allDiscovered.push(...newItems);

      if (!dryRun) {
        // Update ledger
        for (const item of newItems) seenIds.add(item.url);
        ledger[source.id] = {
          last_checked: new Date().toISOString(),
          seen_ids: [...seenIds].slice(-500),
          ...(newHash ? { doc_hash: newHash } : {})
        };
      }
    } else {
      log(WORKER, 'info', `${source.id}: nothing new (${rawItems.length} items checked)`);
      if (!dryRun && newHash) ledger[source.id] = { ...ledger[source.id], doc_hash: newHash };
    }

    logEntries.push({ source: source.id, status: 'ok', new_items: newItems.length, total: rawItems.length });

    // Polite pause between sources
    await new Promise(r => setTimeout(r, 800));
  }

  if (allDiscovered.length > 0 && !dryRun) {
    const outFile = join(stage('discovered'), `${timestampId()}.json`);
    ensureDir(stage('discovered'));
    writeJSON(outFile, allDiscovered);
    writeJSON(LEDGER_FILE, ledger);
    log(WORKER, 'ok', `Wrote ${allDiscovered.length} discovered items → ${outFile}`);
  } else if (allDiscovered.length === 0) {
    log(WORKER, 'info', 'No new items across all sources');
    if (!dryRun) writeJSON(LEDGER_FILE, ledger); // still save updated hashes/timestamps
  }

  writeLog(WORKER, logEntries);
  return allDiscovered;
}

// Run standalone
if (process.argv[1]?.endsWith('scanner.mjs')) {
  runScanner().catch(err => {
    log(WORKER, 'error', err.message);
    process.exit(1);
  });
}
