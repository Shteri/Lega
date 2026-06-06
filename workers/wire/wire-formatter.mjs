/**
 * WIRE FORMATTER — Chief of Wire
 *
 * What it does:  Maps scored items to the wire-item schema, merges them into the
 *                live feed, sorts newest-first, caps the list, and writes the
 *                file the site reads at build time.
 *
 * Input:         pipeline/wire-scored/[timestamp].json
 * Output:        data/wire/items.json   (site reads this directly)
 * Model:         Haiku-tier (mechanical reshape — no AI call needed, same
 *                convention as the research Deduper)
 * Trigger:       After Scorer
 */

import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import {
  DATA, stage, readJSON, writeJSON, advanceFile,
  ensureDir, slugify, log, writeLog
} from '../shared/utils.mjs';

const WORKER = 'wire-formatter';
const ITEMS_FILE = join(DATA, 'wire', 'items.json');
const MAX_ITEMS = 500; // per wire-item-schema.md

function toWireItem(item) {
  const date = item.published || item.fetched_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const id = `wire-${date}-${slugify(item.source_name)}-${slugify(item.title).slice(0, 50)}`.replace(/-+$/g, '');
  return {
    id,
    title:         item.title,
    url:           item.url,
    source:        item.source_name,
    date,
    sectors:       item.sectors || [],
    jurisdictions: item.jurisdictions || [],
    regulators:    item.regulators || [],
    score:         item.score,
    image_url:     item.image_url || null,
    fetched_at:    item.fetched_at
  };
}

export async function runWireFormatter() {
  log(WORKER, 'info', 'Starting wire format');

  const scoredDir = stage('wire-scored');
  ensureDir(join(DATA, 'wire'));

  let files;
  try {
    files = readdirSync(scoredDir).filter(f => f.endsWith('.json'));
  } catch {
    log(WORKER, 'info', 'pipeline/wire-scored/ is empty — nothing to format');
    return [];
  }
  if (files.length === 0) {
    log(WORKER, 'info', 'No scored items to format');
    return [];
  }

  // Load existing live feed
  let existing = [];
  if (existsSync(ITEMS_FILE)) {
    try { existing = readJSON(ITEMS_FILE); } catch { existing = []; }
  }

  const byId = new Map();
  for (const it of existing) byId.set(it.id, it);

  let added = 0;
  for (const file of files) {
    const filePath = join(scoredDir, file);
    for (const item of readJSON(filePath)) {
      const wireItem = toWireItem(item);
      if (!byId.has(wireItem.id)) added++;
      byId.set(wireItem.id, wireItem); // newest version wins on collision
    }
    advanceFile(filePath, 'logs');
  }

  // Sort newest first, then cap
  const merged = [...byId.values()]
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') ||
                    (b.fetched_at || '').localeCompare(a.fetched_at || ''))
    .slice(0, MAX_ITEMS);

  writeJSON(ITEMS_FILE, merged);
  log(WORKER, 'ok', `Wrote ${merged.length} items (${added} new) → ${ITEMS_FILE}`);

  writeLog(WORKER, [{ added, total: merged.length }]);
  return merged;
}

// Run standalone
if (process.argv[1]?.endsWith('wire-formatter.mjs')) {
  runWireFormatter().catch(err => {
    log(WORKER, 'error', err.message);
    process.exit(1);
  });
}
