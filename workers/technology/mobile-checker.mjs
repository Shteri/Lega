/**
 * MOBILE CHECKER — Chief of Technology
 *
 * What it does:  Checks an article will render cleanly on mobile —
 *                title not overly long, no raw HTML <table> (not responsive),
 *                every image has alt text.
 *
 * Input:         pipeline/ready/[slug].md   (runs alongside Schema Checker)
 * Output:        Returns a result object; the orchestrator folds it into the
 *                combined validation report.
 * Model:         Haiku-tier (rule check — no AI call needed)
 * Trigger:       New file in pipeline/ready/
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  stage, parseFrontmatter, ensureDir, log, writeLog
} from '../shared/utils.mjs';

const WORKER = 'mobile-checker';
const TITLE_MAX  = 100; // hard limit — wraps badly / truncates on mobile
const TITLE_WARN = 70;  // ideal upper bound

/**
 * Pure check. Returns { worker, pass, errors, warnings }.
 */
export function checkArticle(content) {
  const { data, body } = parseFrontmatter(content);
  const errors = [];
  const warnings = [];

  const title = data.title || '';
  if (title.length > TITLE_MAX) {
    errors.push(`Title too long for mobile (${title.length} chars > ${TITLE_MAX})`);
  } else if (title.length > TITLE_WARN) {
    warnings.push(`Title is long (${title.length} chars; ideal <= ${TITLE_WARN})`);
  }

  // Raw HTML tables don't reflow on mobile
  if (/<table\b/i.test(body)) {
    errors.push('Raw HTML <table> found — not mobile-responsive; use a markdown table or a responsive wrapper');
  }

  // Markdown images with empty alt text
  for (const m of body.matchAll(/!\[(.*?)\]\(([^)\s]+)[^)]*\)/g)) {
    if (!m[1].trim()) errors.push(`Image missing alt text: ${m[2]}`);
  }

  // HTML <img> tags without a non-empty alt attribute
  for (const m of body.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt\s*=\s*["'][^"']+["']/i.test(m[0])) {
      errors.push(`<img> missing alt text: ${m[0].slice(0, 60)}`);
    }
  }

  return { worker: WORKER, pass: errors.length === 0, errors, warnings };
}

/**
 * Standalone runner: read-only report over pipeline/ready/ (does not move files —
 * the orchestrator owns the move decision).
 */
export async function runMobileChecker() {
  log(WORKER, 'info', 'Starting mobile check');
  const readyDir = stage('ready');
  ensureDir(readyDir);

  let files;
  try {
    files = readdirSync(readyDir).filter(f => f.endsWith('.md'));
  } catch {
    log(WORKER, 'info', 'pipeline/ready/ is empty — nothing to check');
    return [];
  }
  if (files.length === 0) {
    log(WORKER, 'info', 'No ready articles to check');
    return [];
  }

  const logEntries = [];
  const results = [];
  for (const file of files) {
    const result = checkArticle(readFileSync(join(readyDir, file), 'utf8'));
    results.push({ file, ...result });
    log(WORKER, result.pass ? 'ok' : 'error',
      `${file}: ${result.errors.length} issue(s), ${result.warnings.length} warning(s)`);
    logEntries.push({ file, pass: result.pass, errors: result.errors, warnings: result.warnings });
  }

  writeLog(WORKER, logEntries);
  return results;
}

// Run standalone
if (process.argv[1]?.endsWith('mobile-checker.mjs')) {
  runMobileChecker().catch(err => {
    log(WORKER, 'error', err.message);
    process.exit(1);
  });
}
