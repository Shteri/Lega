/**
 * RUN-WIRE — Wire Pipeline Orchestrator
 *
 * Chains the four Wire workers in sequence:
 *   RSS Puller → Wire Deduper → Scorer → Wire Formatter
 *
 * Usage:
 *   node workers/run-wire.mjs               # full run
 *   node workers/run-wire.mjs --dry-run     # report feed count, no writes
 *   node workers/run-wire.mjs --from deduper    # skip puller
 *   node workers/run-wire.mjs --from scorer
 *   node workers/run-wire.mjs --from formatter
 */

import 'dotenv/config';
import { join } from 'path';
import { ROOT, readJSON, log } from './shared/utils.mjs';
import { runRssPuller }     from './wire/rss-puller.mjs';
import { runWireDeduper }   from './wire/wire-deduper.mjs';
import { runScorer }        from './wire/scorer.mjs';
import { runWireFormatter } from './wire/wire-formatter.mjs';

const WORKER = 'run-wire';

// Parse CLI args
const args      = process.argv.slice(2);
const dryRun    = args.includes('--dry-run');
const fromIdx   = args.indexOf('--from');
const fromStage = fromIdx !== -1 ? args[fromIdx + 1] : 'puller';

const STAGES = ['puller', 'deduper', 'scorer', 'formatter'];
const startFrom = STAGES.indexOf(fromStage);
if (startFrom === -1) {
  console.error(`Unknown stage: ${fromStage}. Valid: ${STAGES.join(', ')}`);
  process.exit(1);
}

async function main() {
  const startTime = Date.now();
  log(WORKER, 'info', `=== Wire pipeline start${dryRun ? ' (DRY RUN)' : ''} from: ${fromStage} ===`);

  try {

    if (dryRun) {
      const sources = readJSON(join(ROOT, 'docs', 'wire-sources.json'));
      const pullable = sources.filter(s => s.strategy === 'rss' && s.feed_url);
      log(WORKER, 'info', `${pullable.length} of ${sources.length} sources have a pullable feed_url`);
      log(WORKER, 'info', 'Dry run complete — no writes');
      return;
    }

    // STAGE 1 — RSS PULLER
    if (startFrom <= STAGES.indexOf('puller')) {
      log(WORKER, 'info', '─── Stage 1: RSS Puller');
      const pulled = await runRssPuller();
      log(WORKER, 'ok', `RSS Puller: ${pulled.length} item(s) pulled`);

      if (pulled.length === 0 && startFrom === STAGES.indexOf('puller')) {
        log(WORKER, 'info', 'Nothing pulled — pipeline complete');
        return;
      }
    }

    // STAGE 2 — WIRE DEDUPER
    if (startFrom <= STAGES.indexOf('deduper')) {
      log(WORKER, 'info', '─── Stage 2: Wire Deduper');
      const fresh = await runWireDeduper();
      log(WORKER, 'ok', `Wire Deduper: ${fresh.length} new item(s)`);
    }

    // STAGE 3 — SCORER
    if (startFrom <= STAGES.indexOf('scorer')) {
      log(WORKER, 'info', '─── Stage 3: Scorer');
      const kept = await runScorer();
      log(WORKER, 'ok', `Scorer: ${kept.length} item(s) above threshold`);
    }

    // STAGE 4 — WIRE FORMATTER
    if (startFrom <= STAGES.indexOf('formatter')) {
      log(WORKER, 'info', '─── Stage 4: Wire Formatter');
      const merged = await runWireFormatter();
      log(WORKER, 'ok', `Wire Formatter: ${merged.length} item(s) on the live wire`);
    }

  } catch (err) {
    log(WORKER, 'error', `Pipeline failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(WORKER, 'ok', `=== Wire pipeline complete in ${elapsed}s ===`);
}

main();
