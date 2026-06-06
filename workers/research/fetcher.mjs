/**
 * FETCHER — Chief of Research
 *
 * What it does:  Retrieves the full content of each discovered URL.
 *                Strips HTML to clean text for the Classifier.
 * Input:         pipeline/discovered/[timestamp].json
 * Output:        pipeline/raw/[id].json  (item metadata + clean text)
 * Model:         None (mechanical HTTP fetch + text extraction)
 * Trigger:       New file in pipeline/discovered/
 */

import { readdir } from 'fs/promises';
import { join, basename } from 'path';
import {
  stage, readJSON, writeJSON, advanceFile,
  ensureDir, log, writeLog, urlToId
} from '../shared/utils.mjs';

const WORKER = 'fetcher';
const FETCH_TIMEOUT_MS = 20000;
const MAX_CONTENT_CHARS = 50000; // truncate very long pages

/**
 * Strip HTML tags and collapse whitespace to get clean readable text.
 */
function extractText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function fetchUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'RegWatch/1.0 (regulatory-intelligence-monitor)',
        'Accept': 'text/html,application/xhtml+xml,application/xml'
      }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const contentType = res.headers.get('content-type') || '';
    const body = await res.text();

    // PDF — flag for manual review, don't try to parse
    if (contentType.includes('application/pdf') || url.endsWith('.pdf')) {
      return { type: 'pdf', text: `[PDF document — manual extraction required] URL: ${url}` };
    }

    const text = extractText(body).slice(0, MAX_CONTENT_CHARS);
    return { type: 'html', text };

  } finally {
    clearTimeout(timer);
  }
}

export async function runFetcher() {
  log(WORKER, 'info', 'Starting fetch run');

  const discoveredDir = stage('discovered');
  const rawDir        = stage('raw');
  ensureDir(rawDir);

  // Read all unprocessed discovered files
  let files;
  try {
    files = (await readdir(discoveredDir)).filter(f => f.endsWith('.json'));
  } catch {
    log(WORKER, 'info', 'No discovered items to process');
    return [];
  }

  if (files.length === 0) {
    log(WORKER, 'info', 'pipeline/discovered/ is empty — nothing to fetch');
    return [];
  }

  const logEntries = [];
  const allFetched = [];

  for (const file of files) {
    const filePath = join(discoveredDir, file);
    const items    = readJSON(filePath);

    log(WORKER, 'info', `Processing ${file} (${items.length} items)`);

    for (const item of items) {
      if (!item.url) {
        log(WORKER, 'warn', `Item ${item.id} has no URL — skipping`);
        continue;
      }

      log(WORKER, 'info', `Fetching ${item.url}`);

      let content;
      try {
        content = await fetchUrl(item.url);
      } catch (err) {
        log(WORKER, 'error', `Failed ${item.id}: ${err.message}`);
        logEntries.push({ id: item.id, status: 'error', error: err.message });
        continue;
      }

      const rawItem = {
        ...item,
        content_type: content.type,
        raw_text: content.text,
        fetched_at: new Date().toISOString()
      };

      const outFile = join(rawDir, `${item.id}.json`);
      writeJSON(outFile, rawItem);
      allFetched.push(rawItem);

      logEntries.push({ id: item.id, status: 'ok', content_type: content.type, chars: content.text.length });
      log(WORKER, 'ok', `Fetched ${item.id} (${content.text.length} chars)`);

      // Polite delay between requests
      await new Promise(r => setTimeout(r, 500));
    }

    // Move processed discovered file to logs (don't re-process)
    advanceFile(filePath, 'logs');
  }

  log(WORKER, 'ok', `Fetched ${allFetched.length} items → pipeline/raw/`);
  writeLog(WORKER, logEntries);
  return allFetched;
}

// Run standalone
if (process.argv[1]?.endsWith('fetcher.mjs')) {
  runFetcher().catch(err => {
    log(WORKER, 'error', err.message);
    process.exit(1);
  });
}
