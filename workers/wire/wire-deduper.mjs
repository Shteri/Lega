/**
 * WIRE DEDUPER — Chief of Wire
 *
 * What it does:  Removes feed items that are already on the wire (or are
 *                duplicated within this run). Matches on normalised URL and on
 *                (source + normalised title).
 *
 * Input:         pipeline/wire-raw/[timestamp].json
 * Output:        pipeline/wire-new/[timestamp].json   (array of unseen items)
 * Model:         Haiku-tier (string matching — no AI call needed, same
 *                convention as the research Deduper)
 * Trigger:       After RSS Puller
 */

import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import {
  DATA, stage, readJSON, writeJSON, advanceFile,
  ensureDir, timestampId, log, writeLog
} from '../shared/utils.mjs';

const WORKER = 'wire-deduper';
const ITEMS_FILE = join(DATA, 'wire', 'items.json');

function normUrl(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    x.search = '';
    return (x.host + x.pathname).replace(/\/+$/, '').toLowerCase();
  } catch {
    return (u || '').trim().toLowerCase();
  }
}

function normTitle(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function titleKey(item) {
  return `${(item.source_name || item.source || '').toLowerCase()}|${normTitle(item.title)}`;
}

export async function runWireDeduper() {
  log(WORKER, 'info', 'Starting wire dedup');

  const rawDir = stage('wire-raw');
  const newDir = stage('wire-new');
  ensureDir(newDir);

  let files;
  try {
    files = readdirSync(rawDir).filter(f => f.endsWith('.json'));
  } catch {
    log(WORKER, 'info', 'pipeline/wire-raw/ is empty — nothing to dedup');
    return [];
  }
  if (files.length === 0) {
    log(WORKER, 'info', 'No raw wire batches to dedup');
    return [];
  }

  // Build index of items already on the live wire
  const urlIndex   = new Set();
  const titleIndex = new Set();
  if (existsSync(ITEMS_FILE)) {
    try {
      for (const it of readJSON(ITEMS_FILE)) {
        if (it.url) urlIndex.add(normUrl(it.url));
        titleIndex.add(titleKey(it));
      }
    } catch { /* corrupt or empty — treat as no history */ }
  }
  log(WORKER, 'info', `Wire index: ${urlIndex.size} URLs, ${titleIndex.size} title keys`);

  const logEntries = [];
  const fresh      = [];
  let totalSeen = 0, totalDup = 0;

  for (const file of files) {
    const filePath = join(rawDir, file);
    const items = readJSON(filePath);

    for (const item of items) {
      totalSeen++;
      const uKey = normUrl(item.url);
      const tKey = titleKey(item);

      if (urlIndex.has(uKey) || titleIndex.has(tKey)) {
        totalDup++;
        continue;
      }

      // Mark as seen so later items in this run dedup against it too
      urlIndex.add(uKey);
      titleIndex.add(tKey);
      fresh.push(item);
    }

    // Consume the raw batch
    advanceFile(filePath, 'logs');
    logEntries.push({ file, items: items.length });
  }

  log(WORKER, 'ok', `Dedup complete — ${fresh.length} new, ${totalDup} duplicates (of ${totalSeen})`);

  if (fresh.length > 0) {
    const outFile = join(newDir, `${timestampId()}.json`);
    writeJSON(outFile, fresh);
    log(WORKER, 'ok', `Wrote ${fresh.length} new items → ${outFile}`);
  }

  writeLog(WORKER, logEntries);
  return fresh;
}

// Run standalone
if (process.argv[1]?.endsWith('wire-deduper.mjs')) {
  runWireDeduper().catch(err => {
    log(WORKER, 'error', err.message);
    process.exit(1);
  });
}
