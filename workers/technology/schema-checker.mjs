/**
 * SCHEMA CHECKER — Chief of Technology
 *
 * What it does:  Validates an article's frontmatter against article-schema.md —
 *                required fields present, enum values valid, dates well-formed,
 *                primary_sources present and well-shaped.
 *
 * Input:         pipeline/ready/[slug].md
 * Output:        (standalone) PASS → pipeline/validated/, FAIL → pipeline/errors/ + report
 *                (via orchestrator) returns a result object; the orchestrator moves the file
 * Model:         Haiku-tier (deterministic rule check — no AI call needed, same
 *                convention as the research Deduper)
 * Trigger:       New file in pipeline/ready/
 */

import { readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import {
  stage, writeJSON, parseFrontmatter, advanceFile,
  ensureDir, log, writeLog
} from '../shared/utils.mjs';

const WORKER = 'schema-checker';

const SECTORS       = new Set(['AI', 'FT', 'CR', 'PL', 'PV', 'GG', 'CY']);
const CONTENT_TYPES = new Set(['LEG', 'BILL', 'RULE', 'RTS', 'QA', 'GUID', 'NOAC', 'SUPV', 'ENF', 'CONS', 'SPCH', 'PR', 'RPT', 'LIC', 'ALRT', 'HRNG']);
const JURISDICTIONS = new Set(['EU', 'US', 'UK', 'US-STATE', 'GLOBAL']);
const REQUIRED      = ['title', 'layout', 'sector', 'content_type', 'jurisdiction', 'event_date', 'pub_date', 'regulator'];
const DATE_RE       = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pure validation. Returns { worker, pass, errors, warnings }.
 */
export function checkArticle(content) {
  const { data } = parseFrontmatter(content);
  const errors = [];
  const warnings = [];

  for (const field of REQUIRED) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (data.layout && data.layout !== 'article.njk') {
    errors.push(`layout must be "article.njk" (got "${data.layout}")`);
  }
  if (data.sector && !SECTORS.has(data.sector)) {
    errors.push(`Invalid sector: "${data.sector}" (valid: ${[...SECTORS].join(', ')})`);
  }
  if (data.content_type && !CONTENT_TYPES.has(data.content_type)) {
    errors.push(`Invalid content_type: "${data.content_type}"`);
  }
  if (data.jurisdiction && !JURISDICTIONS.has(data.jurisdiction)) {
    errors.push(`Invalid jurisdiction: "${data.jurisdiction}" (valid: ${[...JURISDICTIONS].join(', ')})`);
  }
  if (data.event_date && !DATE_RE.test(data.event_date)) {
    errors.push(`event_date is not ISO 8601 (YYYY-MM-DD): "${data.event_date}"`);
  }
  if (data.pub_date && !DATE_RE.test(data.pub_date)) {
    errors.push(`pub_date is not ISO 8601 (YYYY-MM-DD): "${data.pub_date}"`);
  }

  if (!Array.isArray(data.primary_sources) || data.primary_sources.length === 0) {
    errors.push('primary_sources is required (at least one source with label + url)');
  } else {
    data.primary_sources.forEach((s, i) => {
      if (!s || !s.label) errors.push(`primary_sources[${i}] missing label`);
      if (!s || !s.url || !/^https?:\/\//.test(s.url)) errors.push(`primary_sources[${i}] missing or invalid url`);
    });
  }

  for (const flag of ['backfill_needed', 'is_update']) {
    if (data[flag] !== undefined && typeof data[flag] !== 'boolean') {
      errors.push(`${flag} must be a boolean (true/false)`);
    }
  }
  if (data.tags !== undefined && !Array.isArray(data.tags)) {
    errors.push('tags must be a list');
  }
  if (!data.law_slug) {
    warnings.push('law_slug is empty (recommended)');
  }

  return { worker: WORKER, pass: errors.length === 0, errors, warnings };
}

/**
 * Standalone runner: schema-only gate. PASS → validated/, FAIL → errors/ + report.
 * (The orchestrator uses checkArticle() instead and combines all three checks.)
 */
export async function runSchemaChecker() {
  log(WORKER, 'info', 'Starting schema check');
  const readyDir = stage('ready');
  ensureDir(stage('validated'));
  ensureDir(stage('errors'));

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
    const filePath = join(readyDir, file);
    const result = checkArticle(readFileSync(filePath, 'utf8'));
    results.push({ file, ...result });

    if (result.pass) {
      advanceFile(filePath, 'validated');
      log(WORKER, 'ok', `PASS → validated: ${file}`);
    } else {
      advanceFile(filePath, 'errors');
      writeJSON(join(stage('errors'), `${basename(file, '.md')}.report.json`), {
        slug: basename(file, '.md'), pass: false, checks: { schema: result }, checked_at: new Date().toISOString()
      });
      log(WORKER, 'error', `FAIL → errors: ${file} (${result.errors.length} error(s))`);
    }
    logEntries.push({ file, pass: result.pass, errors: result.errors });
  }

  writeLog(WORKER, logEntries);
  return results;
}

// Run standalone
if (process.argv[1]?.endsWith('schema-checker.mjs')) {
  runSchemaChecker().catch(err => {
    log(WORKER, 'error', err.message);
    process.exit(1);
  });
}
