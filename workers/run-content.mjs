/**
 * RUN-CONTENT — Content Pipeline Orchestrator
 *
 * Chains the three Content workers in sequence:
 *   Writer → Tagger → Backfill Checker
 *
 * Usage:
 *   node workers/run-content.mjs              # full run
 *   node workers/run-content.mjs --dry-run    # report inbox count, no writes
 *   node workers/run-content.mjs --from tagger    # skip writer, start from tagger
 *   node workers/run-content.mjs --from backfill
 */

import 'dotenv/config';
import { readdirSync } from 'fs';
import { stage, log } from './shared/utils.mjs';
import { runWriter }           from './content/writer.mjs';
import { runTagger }           from './content/tagger.mjs';
import { runBackfillChecker }  from './content/backfill-checker.mjs';

const WORKER = 'run-content';

// Parse CLI args
const args      = process.argv.slice(2);
const dryRun    = args.includes('--dry-run');
const fromIdx   = args.indexOf('--from');
const fromStage = fromIdx !== -1 ? args[fromIdx + 1] : 'writer';

const STAGES = ['writer', 'tagger', 'backfill'];
const startFrom = STAGES.indexOf(fromStage);
if (startFrom === -1) {
  console.error(`Unknown stage: ${fromStage}. Valid: ${STAGES.join(', ')}`);
  process.exit(1);
}

function countFiles(stageName, ext) {
  try {
    return readdirSync(stage(stageName)).filter((f) => f.endsWith(ext)).length;
  } catch {
    return 0;
  }
}

async function main() {
  const startTime = Date.now();
  log(WORKER, 'info', `=== Content pipeline start${dryRun ? ' (DRY RUN)' : ''} from: ${fromStage} ===`);

  try {

    if (dryRun) {
      const inboxCount = countFiles('inbox', '.json');
      log(WORKER, 'info', `pipeline/inbox/ has ${inboxCount} item(s) ready to write`);
      log(WORKER, 'info', 'Dry run complete — no writes');
      return;
    }

    // STAGE 1 — WRITER
    if (startFrom <= STAGES.indexOf('writer')) {
      log(WORKER, 'info', '─── Stage 1: Writer');
      const drafts = await runWriter();
      log(WORKER, 'ok', `Writer: ${drafts.length} article(s) drafted`);

      if (drafts.length === 0 && startFrom === STAGES.indexOf('writer')) {
        log(WORKER, 'info', 'Nothing drafted — pipeline complete');
        return;
      }
    }

    // STAGE 2 — TAGGER
    if (startFrom <= STAGES.indexOf('tagger')) {
      log(WORKER, 'info', '─── Stage 2: Tagger');
      const tagged = await runTagger();
      log(WORKER, 'ok', `Tagger: ${tagged.length} article(s) ready`);
    }

    // STAGE 3 — BACKFILL CHECKER
    if (startFrom <= STAGES.indexOf('backfill')) {
      log(WORKER, 'info', '─── Stage 3: Backfill Checker');
      const reports = await runBackfillChecker();
      log(WORKER, 'ok', `Backfill Checker: ${reports.length} report(s) written`);
    }

    const readyCount = countFiles('ready', '.md');
    if (readyCount > 0) {
      log(WORKER, 'ok', `✓ ${readyCount} article(s) ready in pipeline/ready/ for Chief of Technology`);
    }

  } catch (err) {
    log(WORKER, 'error', `Pipeline failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(WORKER, 'ok', `=== Content pipeline complete in ${elapsed}s ===`);
}

main();
