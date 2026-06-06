/**
 * RUN-DEPLOY — Deploy Pipeline Orchestrator
 *
 * Chains the three Deploy workers in sequence:
 *   Builder → Publisher → Verifier
 *
 * The list of articles Builder publishes flows through to the Verifier so it
 * knows which live URLs to check.
 *
 * Usage:
 *   node workers/run-deploy.mjs              # full deploy
 *   node workers/run-deploy.mjs --dry-run    # report validated count, no changes
 *   node workers/run-deploy.mjs --from publisher   # skip builder
 *   node workers/run-deploy.mjs --from verifier
 *   node workers/run-deploy.mjs --no-wait    # verifier skips the 60s wait
 */

import 'dotenv/config';
import { readdirSync } from 'fs';
import { stage, log } from './shared/utils.mjs';
import { runBuilder }   from './deploy/builder.mjs';
import { runPublisher } from './deploy/publisher.mjs';
import { runVerifier }  from './deploy/verifier.mjs';

const WORKER = 'run-deploy';

const args      = process.argv.slice(2);
const dryRun    = args.includes('--dry-run');
const noWait    = args.includes('--no-wait');
const fromIdx   = args.indexOf('--from');
const fromStage = fromIdx !== -1 ? args[fromIdx + 1] : 'builder';

const STAGES = ['builder', 'publisher', 'verifier'];
const startFrom = STAGES.indexOf(fromStage);
if (startFrom === -1) {
  console.error(`Unknown stage: ${fromStage}. Valid: ${STAGES.join(', ')}`);
  process.exit(1);
}

function countValidated() {
  try {
    return readdirSync(stage('validated')).filter(f => f.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

async function main() {
  const startTime = Date.now();
  log(WORKER, 'info', `=== Deploy pipeline start${dryRun ? ' (DRY RUN)' : ''} from: ${fromStage} ===`);

  try {

    if (dryRun) {
      log(WORKER, 'info', `pipeline/validated/ has ${countValidated()} article(s) ready to deploy`);
      log(WORKER, 'info', 'Dry run complete — no build, commit, or push');
      return;
    }

    let moved = [];

    // STAGE 1 — BUILDER
    if (startFrom <= STAGES.indexOf('builder')) {
      log(WORKER, 'info', '─── Stage 1: Builder');
      const result = await runBuilder();
      moved = result.moved;
      log(WORKER, 'ok', `Builder: ${moved.length} article(s) built`);

      if (!result.built && startFrom === STAGES.indexOf('builder')) {
        log(WORKER, 'info', 'Nothing to build — pipeline complete');
        return;
      }
    }

    // STAGE 2 — PUBLISHER
    if (startFrom <= STAGES.indexOf('publisher')) {
      log(WORKER, 'info', '─── Stage 2: Publisher');
      const result = await runPublisher({ moved });
      if (!result.committed) {
        log(WORKER, 'info', 'Nothing committed — skipping verification');
        return;
      }
      log(WORKER, 'ok', 'Publisher: pushed to remote');
    }

    // STAGE 3 — VERIFIER
    if (startFrom <= STAGES.indexOf('verifier')) {
      log(WORKER, 'info', '─── Stage 3: Verifier');
      const result = await runVerifier({ articles: moved, wait: !noWait });
      log(WORKER, result.pass ? 'ok' : 'error',
        `Verifier: ${result.pass ? 'PASS — articles are live' : 'FAIL — check the report'}`);
      if (!result.pass) process.exitCode = 1;
    }

  } catch (err) {
    log(WORKER, 'error', `Pipeline failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(WORKER, 'ok', `=== Deploy pipeline complete in ${elapsed}s ===`);
}

main();
