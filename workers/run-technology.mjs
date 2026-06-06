/**
 * RUN-TECHNOLOGY — Technology Pipeline Orchestrator
 *
 * For each article in pipeline/ready/, runs the three checks in parallel:
 *   Schema Checker + Link Checker + Mobile Checker
 *
 * All pass → pipeline/validated/[slug].md
 * Any fail → pipeline/errors/[slug].md  +  pipeline/errors/[slug].report.json
 *
 * Usage:
 *   node workers/run-technology.mjs            # validate everything in ready/
 *   node workers/run-technology.mjs --dry-run  # report ready count, no moves
 */

import 'dotenv/config';
import { readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import {
  stage, writeJSON, advanceFile, ensureDir, log, writeLog
} from './shared/utils.mjs';
import { checkArticle as schemaCheck } from './technology/schema-checker.mjs';
import { checkArticle as linkCheck }   from './technology/link-checker.mjs';
import { checkArticle as mobileCheck } from './technology/mobile-checker.mjs';

const WORKER = 'run-technology';

const args   = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

function countReady() {
  try {
    return readdirSync(stage('ready')).filter(f => f.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

async function main() {
  const startTime = Date.now();
  log(WORKER, 'info', `=== Technology pipeline start${dryRun ? ' (DRY RUN)' : ''} ===`);

  if (dryRun) {
    log(WORKER, 'info', `pipeline/ready/ has ${countReady()} article(s) to validate`);
    log(WORKER, 'info', 'Dry run complete — no moves');
    return;
  }

  const readyDir = stage('ready');
  ensureDir(stage('validated'));
  ensureDir(stage('errors'));

  let files;
  try {
    files = readdirSync(readyDir).filter(f => f.endsWith('.md'));
  } catch {
    log(WORKER, 'info', 'pipeline/ready/ is empty — nothing to validate');
    return;
  }
  if (files.length === 0) {
    log(WORKER, 'info', 'No ready articles to validate');
    return;
  }

  const logEntries = [];
  let passed = 0, failed = 0;

  for (const file of files) {
    const filePath = join(readyDir, file);
    const slug = basename(file, '.md');
    const content = readFileSync(filePath, 'utf8');

    log(WORKER, 'info', `Validating ${file}`);

    // Run the three checks in parallel (schema + mobile are sync, link is async)
    const [schema, links, mobile] = await Promise.all([
      Promise.resolve(schemaCheck(content)),
      linkCheck(content),
      Promise.resolve(mobileCheck(content))
    ]);

    const pass = schema.pass && links.pass && mobile.pass;
    const report = {
      slug,
      pass,
      checks: { schema, links, mobile },
      checked_at: new Date().toISOString()
    };

    if (pass) {
      advanceFile(filePath, 'validated');
      passed++;
      log(WORKER, 'ok', `PASS → validated: ${file}`);
    } else {
      advanceFile(filePath, 'errors');
      writeJSON(join(stage('errors'), `${slug}.report.json`), report);
      failed++;
      const allErrors = [...schema.errors, ...links.errors, ...mobile.errors];
      log(WORKER, 'error', `FAIL → errors: ${file}`);
      for (const e of allErrors) log(WORKER, 'warn', `  • ${e}`);
    }

    logEntries.push({ file, pass, errors: [...schema.errors, ...links.errors, ...mobile.errors] });
  }

  log(WORKER, 'ok', `${passed} passed → validated/, ${failed} failed → errors/`);
  if (passed > 0) log(WORKER, 'ok', `✓ ${passed} article(s) ready in pipeline/validated/ for Chief of Deploy`);

  writeLog(WORKER, logEntries);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(WORKER, 'ok', `=== Technology pipeline complete in ${elapsed}s ===`);
}

main();
