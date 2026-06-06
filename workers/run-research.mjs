/**
 * RUN-RESEARCH — Research Pipeline Orchestrator
 *
 * Chains all five Research workers in sequence:
 *   Scanner → Fetcher → Classifier → Specialist → Deduper
 *
 * Usage:
 *   node workers/run-research.mjs           # full run
 *   node workers/run-research.mjs --dry-run # scanner only, no writes
 *   node workers/run-research.mjs --from fetcher  # skip scanner, start from fetcher
 *   node workers/run-research.mjs --from classifier
 *   node workers/run-research.mjs --from specialist
 *   node workers/run-research.mjs --from deduper
 */

import 'dotenv/config';
import { log } from './shared/utils.mjs';
import { runScanner }    from './research/scanner.mjs';
import { runFetcher }    from './research/fetcher.mjs';
import { runClassifier } from './research/classifier.mjs';
import { runDeduper }    from './research/deduper.mjs';
import { routeToSpecialist } from './research/specialist-router.mjs';
import { readdirSync } from 'fs';
import { join } from 'path';
import { stage, readJSON, ensureDir } from './shared/utils.mjs';

const WORKER = 'run-research';

// Parse CLI args
const args    = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const fromIdx = args.indexOf('--from');
const fromStage = fromIdx !== -1 ? args[fromIdx + 1] : 'scanner';

const STAGES = ['scanner', 'fetcher', 'classifier', 'specialist', 'deduper'];
const startFrom = STAGES.indexOf(fromStage);
if (startFrom === -1) {
  console.error(`Unknown stage: ${fromStage}. Valid: ${STAGES.join(', ')}`);
  process.exit(1);
}

async function runSpecialistStage() {
  log(WORKER, 'info', 'Running specialist stage');
  ensureDir(stage('extracted'));

  let classifiedFiles;
  try {
    classifiedFiles = readdirSync(stage('classified')).filter(f => f.endsWith('.json'));
  } catch {
    log(WORKER, 'info', 'pipeline/classified/ is empty');
    return [];
  }

  if (classifiedFiles.length === 0) {
    log(WORKER, 'info', 'No classified items — specialist stage skipped');
    return [];
  }

  const results = [];
  for (const file of classifiedFiles) {
    const item = readJSON(join(stage('classified'), file));
    const { sector, jurisdiction } = item.classification || {};

    log(WORKER, 'info', `Routing ${sector}/${jurisdiction} → specialist`);

    let result;
    try {
      result = await routeToSpecialist(item);
      if (result?.error) {
        log(WORKER, 'warn', `No specialist: ${result.error} — item stays in classified/`);
        continue;
      }
      results.push(result);
    } catch (err) {
      log(WORKER, 'error', `Specialist failed for ${file}: ${err.message}`);
      continue;
    }

    // Move classified file to logs after specialist processes it
    const { advanceFile } = await import('./shared/utils.mjs');
    advanceFile(join(stage('classified'), file), 'logs');
  }

  log(WORKER, 'ok', `Specialist stage complete — ${results.length} items extracted`);
  return results;
}

async function main() {
  const startTime = Date.now();
  log(WORKER, 'info', `=== Research pipeline start${dryRun ? ' (DRY RUN)' : ''} from: ${fromStage} ===`);

  try {

    // STAGE 1 — SCANNER
    if (startFrom <= STAGES.indexOf('scanner')) {
      log(WORKER, 'info', '─── Stage 1: Scanner');
      const discovered = await runScanner({ dryRun });
      log(WORKER, 'ok', `Scanner: ${discovered.length} new items discovered`);

      if (dryRun) {
        log(WORKER, 'info', 'Dry run complete — stopping after scanner');
        return;
      }

      if (discovered.length === 0) {
        log(WORKER, 'info', 'Nothing new — pipeline complete');
        return;
      }
    }

    // STAGE 2 — FETCHER
    if (startFrom <= STAGES.indexOf('fetcher')) {
      log(WORKER, 'info', '─── Stage 2: Fetcher');
      const fetched = await runFetcher();
      log(WORKER, 'ok', `Fetcher: ${fetched.length} items fetched`);

      if (fetched.length === 0) {
        log(WORKER, 'info', 'Nothing fetched — stopping');
        return;
      }
    }

    // STAGE 3 — CLASSIFIER
    if (startFrom <= STAGES.indexOf('classifier')) {
      log(WORKER, 'info', '─── Stage 3: Classifier');
      const classified = await runClassifier();
      log(WORKER, 'ok', `Classifier: ${classified.length} items classified`);
    }

    // STAGE 4 — SPECIALISTS
    if (startFrom <= STAGES.indexOf('specialist')) {
      log(WORKER, 'info', '─── Stage 4: Specialists');
      const extracted = await runSpecialistStage();
      log(WORKER, 'ok', `Specialists: ${extracted.length} items extracted`);
    }

    // STAGE 5 — DEDUPER
    if (startFrom <= STAGES.indexOf('deduper')) {
      log(WORKER, 'info', '─── Stage 5: Deduper');
      const { inbox, duplicates } = await runDeduper();
      log(WORKER, 'ok', `Deduper: ${inbox.length} new → inbox, ${duplicates.length} duplicates`);

      if (inbox.length > 0) {
        log(WORKER, 'ok', `✓ ${inbox.length} item(s) ready in pipeline/inbox/ for Chief of Content`);
      }
    }

  } catch (err) {
    log(WORKER, 'error', `Pipeline failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(WORKER, 'ok', `=== Research pipeline complete in ${elapsed}s ===`);
}

main();
