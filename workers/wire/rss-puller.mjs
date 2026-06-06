/**
 * RSS PULLER — Chief of Wire
 *
 * What it does:  Fetches RSS/Atom feeds from the trade-press sources in
 *                docs/wire-sources.json (NOT regulator sites — those are the
 *                Scanner's job). Normalises each item and captures a thumbnail
 *                image URL where the feed provides one.
 *
 * Input:         docs/wire-sources.json   (strategy: "rss", feed_url)
 * Output:        pipeline/wire-raw/[timestamp].json   (array of raw items)
 * Model:         Haiku-tier (mechanical fetch + parse — no AI call needed,
 *                same convention as the research Deduper)
 * Trigger:       Scheduled — every 10 minutes
 */

import Parser from 'rss-parser';
import { join } from 'path';
import {
  ROOT, stage, readJSON, writeJSON,
  ensureDir, timestampId, log, writeLog
} from '../shared/utils.mjs';

const WORKER = 'rss-puller';
const SOURCES_FILE = join(ROOT, 'docs', 'wire-sources.json');

const FETCH_TIMEOUT_MS = 20000;
const MAX_AGE_DAYS = 30;        // ignore stale items (keeps the wire "live")
const MAX_ITEMS_PER_FEED = 40;  // cap per feed per run
const USER_AGENT = 'Mozilla/5.0 (compatible; Legata-Wire/1.0; regulatory-intelligence-monitor)';

const parser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT },
  customFields: {
    item: [
      ['media:content',   'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
      ['content:encoded', 'contentEncoded']
    ]
  }
});

// Pull the best available image URL out of a feed item.
function extractImage(item) {
  if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url;
  if (Array.isArray(item.mediaContent)) {
    const img = item.mediaContent.find(m => (m?.$?.medium === 'image' || (m?.$?.type || '').startsWith('image')) && m?.$?.url)
             || item.mediaContent.find(m => m?.$?.url);
    if (img?.$?.url) return img.$.url;
  }
  if (item.enclosure?.url && (item.enclosure.type || '').startsWith('image')) return item.enclosure.url;
  const html = item.contentEncoded || item.content || '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function isFresh(isoDate) {
  if (!isoDate) return true; // no date — let it through, downstream will handle
  const ts = Date.parse(isoDate);
  if (Number.isNaN(ts)) return true;
  return (Date.now() - ts) <= MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

export async function runRssPuller() {
  log(WORKER, 'info', 'Starting RSS pull');

  const sources = readJSON(SOURCES_FILE).filter(s => s.strategy === 'rss' && s.feed_url);
  const skipped = readJSON(SOURCES_FILE).filter(s => s.strategy === 'rss' && !s.feed_url);
  if (skipped.length) {
    log(WORKER, 'info', `Skipping ${skipped.length} source(s) with no feed_url: ${skipped.map(s => s.id).join(', ')}`);
  }

  const logEntries = [];
  const allItems   = [];

  for (const source of sources) {
    log(WORKER, 'info', `[rss] ${source.id}`);

    let feed;
    try {
      feed = await parser.parseURL(source.feed_url);
    } catch (err) {
      log(WORKER, 'error', `${source.id} failed: ${err.message}`);
      logEntries.push({ source: source.id, status: 'error', error: err.message });
      continue;
    }

    const items = (feed.items || [])
      .filter(it => (it.link || it.guid) && isFresh(it.isoDate))
      .slice(0, MAX_ITEMS_PER_FEED)
      .map(it => ({
        source_id:    source.id,
        source_name:  source.name,
        sectors:      source.sectors,
        jurisdiction: source.jurisdiction,
        title:        (it.title || '').trim(),
        url:          (it.link || it.guid || '').trim(),
        published:    it.isoDate ? it.isoDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
        summary:      (it.contentSnippet || it.summary || '').trim().slice(0, 500),
        image_url:    extractImage(it),
        fetched_at:   new Date().toISOString()
      }));

    allItems.push(...items);
    log(WORKER, 'ok', `${source.id}: ${items.length} item(s)`);
    logEntries.push({ source: source.id, status: 'ok', items: items.length });

    // Polite pause between feeds
    await new Promise(r => setTimeout(r, 500));
  }

  if (allItems.length === 0) {
    log(WORKER, 'info', 'No items pulled across all feeds');
    writeLog(WORKER, logEntries);
    return [];
  }

  const outFile = join(stage('wire-raw'), `${timestampId()}.json`);
  ensureDir(stage('wire-raw'));
  writeJSON(outFile, allItems);
  log(WORKER, 'ok', `Wrote ${allItems.length} raw items → ${outFile}`);

  writeLog(WORKER, logEntries);
  return allItems;
}

// Run standalone
if (process.argv[1]?.endsWith('rss-puller.mjs')) {
  runRssPuller().catch(err => {
    log(WORKER, 'error', err.message);
    process.exit(1);
  });
}
