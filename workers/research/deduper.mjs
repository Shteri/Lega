/**
 * DEDUPER — Chief of Research
 *
 * What it does:  Checks extracted facts against existing published articles.
 *                Routes new items to pipeline/inbox/ for Content.
 *                Routes duplicates to pipeline/duplicates/.
 *                Routes updates to pipeline/inbox/ with update flag.
 *
 * Input:         pipeline/extracted/[id].json
 * Output:        pipeline/inbox/[id].json        (new or update)
 *                pipeline/duplicates/[id].json   (duplicate)
 * Model:         Haiku (string matching — no AI needed)
 * Trigger:       New file in pipeline/extracted/
 */

import { readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import {
  ROOT, ARTICLES, stage, readJSON, writeJSON,
  advanceFile, ensureDir, log, writeLog
} from '../shared/utils.mjs';

const WORKER = 'deduper';

/**
 * Build a simple index of published articles for comparison.
 * Indexed by: source URL and by (regulator + event_date + law_slug).
 */
function buildArticleIndex() {
  const urlIndex   = new Set();
  const topicIndex = new Set(); // "REGULATOR|DATE|LAW_SLUG"

  let files;
  try {
    files = readdirSync(ARTICLES).filter(f => f.endsWith('.md'));
  } catch {
    return { urlIndex, topicIndex };
  }

  for (const file of files) {
    try {
      const content = readFileSync(join(ARTICLES, file), 'utf8');

      // Extract source URLs from frontmatter primary_sources
      const urlMatches = content.matchAll(/url:\s*["']?(.+?)["']?\s*$/gm);
      for (const [, url] of urlMatches) {
        if (url.startsWith('http')) urlIndex.add(url.trim());
      }

      // Extract topic key from frontmatter
      const regMatch   = content.match(/^regulator:\s*(.+)$/m);
      const dateMatch  = content.match(/^event_date:\s*(.+)$/m);
      const slugMatch  = content.match(/^law_slug:\s*(.+)$/m);

      if (regMatch && dateMatch) {
        const key = `${regMatch[1].trim()}|${dateMatch[1].trim()}|${(slugMatch?.[1] || '').trim()}`;
        topicIndex.add(key);
      }
    } catch {
      // skip unreadable files
    }
  }

  return { urlIndex, topicIndex };
}

export async function runDeduper() {
  log(WORKER, 'info', 'Starting dedup run');

  const extractedDir  = stage('extracted');
  const inboxDir      = stage('inbox');
  const duplicatesDir = stage('duplicates');
  ensureDir(inboxDir);
  ensureDir(duplicatesDir);

  let files;
  try {
    files = readdirSync(extractedDir).filter(f => f.endsWith('.json'));
  } catch {
    log(WORKER, 'info', 'pipeline/extracted/ is empty — nothing to dedup');
    return { inbox: [], duplicates: [] };
  }

  if (files.length === 0) {
    log(WORKER, 'info', 'No extracted items to dedup');
    return { inbox: [], duplicates: [] };
  }

  const { urlIndex, topicIndex } = buildArticleIndex();
  log(WORKER, 'info', `Article index: ${urlIndex.size} URLs, ${topicIndex.size} topic keys`);

  const logEntries = [];
  const inbox      = [];
  const duplicates = [];

  for (const file of files) {
    const filePath = join(extractedDir, file);
    const item     = readJSON(filePath);

    const sourceUrl  = item.source_url;
    const regulator  = item.classification?.regulator || '';
    const eventDate  = item.item?.event_date || '';
    const lawSlug    = item.item?.law_slug || '';
    const topicKey   = `${regulator}|${eventDate}|${lawSlug}`;

    let status = 'new';

    if (sourceUrl && urlIndex.has(sourceUrl)) {
      status = 'duplicate-url';
    } else if (topicKey !== '||' && topicIndex.has(topicKey)) {
      status = 'duplicate-topic';
    }

    if (status === 'new') {
      const dest = join(inboxDir, file);
      writeJSON(dest, item);
      inbox.push(item);
      log(WORKER, 'ok', `NEW → inbox: ${item.item?.title?.slice(0, 60)}`);
    } else {
      const dest = join(duplicatesDir, file);
      writeJSON(dest, { ...item, dedup_status: status });
      duplicates.push(item);
      log(WORKER, 'info', `DUPLICATE (${status}) → duplicates: ${item.item?.title?.slice(0, 60)}`);
    }

    // Remove from extracted
    advanceFile(filePath, 'logs');

    logEntries.push({ file, status, title: item.item?.title?.slice(0, 60) });
  }

  log(WORKER, 'ok', `Dedup complete — inbox: ${inbox.length}, duplicates: ${duplicates.length}`);
  writeLog(WORKER, logEntries);
  return { inbox, duplicates };
}

// Run standalone
if (process.argv[1]?.endsWith('deduper.mjs')) {
  runDeduper().catch(err => {
    log(WORKER, 'error', err.message);
    process.exit(1);
  });
}
