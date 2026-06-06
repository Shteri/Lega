/**
 * LINK CHECKER — Chief of Technology
 *
 * What it does:  Extracts every URL in an article (primary_sources + inline
 *                links + bare URLs) and checks each resolves. Any broken link
 *                (HTTP >= 400 or unreachable) fails the article.
 *
 * Input:         pipeline/ready/[slug].md   (runs alongside Schema Checker)
 * Output:        Returns a result object; the orchestrator folds it into the
 *                combined validation report.
 * Model:         Haiku-tier (HTTP requests — no AI call needed)
 * Trigger:       New file in pipeline/ready/
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  stage, parseFrontmatter, ensureDir, log, writeLog
} from '../shared/utils.mjs';

const WORKER = 'link-checker';
const FETCH_TIMEOUT_MS = 15000;
const USER_AGENT = 'Mozilla/5.0 (compatible; Legata-LinkCheck/1.0; +regulatory-intelligence-monitor)';

// Pull all URLs out of an article (frontmatter sources + body links).
export function collectUrls(content) {
  const { data, body } = parseFrontmatter(content);
  const urls = new Set();

  for (const s of data.primary_sources || []) {
    if (s?.url && /^https?:\/\//.test(s.url)) urls.add(s.url);
  }
  // Markdown links: [text](url)
  for (const m of body.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) urls.add(m[1]);
  // Bare URLs
  for (const m of body.matchAll(/\bhttps?:\/\/[^\s)<>"'\]]+/g)) urls.add(m[0]);

  return [...urls];
}

async function probe(url, method) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*' }
    });
    return res.status;
  } finally {
    clearTimeout(timer);
  }
}

async function checkUrl(url) {
  try {
    let status = await probe(url, 'HEAD');
    // Some servers reject HEAD — retry with GET
    if (status === 403 || status === 405 || status === 501 || status === 0) {
      status = await probe(url, 'GET');
    }
    return { url, status, ok: status >= 200 && status < 400 };
  } catch (err) {
    return { url, status: null, ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
  }
}

/**
 * Pure check. Returns { worker, pass, errors, warnings, checked }.
 */
export async function checkArticle(content) {
  const urls = collectUrls(content);
  const errors = [];

  if (urls.length === 0) {
    return { worker: WORKER, pass: true, errors, warnings: ['No URLs found in article'], checked: 0 };
  }

  const results = await Promise.all(urls.map(checkUrl));
  for (const r of results) {
    if (!r.ok) {
      errors.push(r.error ? `Unreachable (${r.error}): ${r.url}` : `Broken link (HTTP ${r.status}): ${r.url}`);
    }
  }

  return { worker: WORKER, pass: errors.length === 0, errors, warnings: [], checked: urls.length };
}

/**
 * Standalone runner: read-only report over pipeline/ready/ (does not move files —
 * the orchestrator owns the move decision).
 */
export async function runLinkChecker() {
  log(WORKER, 'info', 'Starting link check');
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
    const result = await checkArticle(readFileSync(join(readyDir, file), 'utf8'));
    results.push({ file, ...result });
    log(WORKER, result.pass ? 'ok' : 'error',
      `${file}: ${result.checked} link(s), ${result.errors.length} broken`);
    logEntries.push({ file, pass: result.pass, errors: result.errors });
  }

  writeLog(WORKER, logEntries);
  return results;
}

// Run standalone
if (process.argv[1]?.endsWith('link-checker.mjs')) {
  runLinkChecker().catch(err => {
    log(WORKER, 'error', err.message);
    process.exit(1);
  });
}
