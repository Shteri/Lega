/**
 * VERIFIER — Chief of Deploy
 *
 * What it does:  Waits for the Netlify build to land, then fetches the live site
 *                and confirms each published article appears (HTTP 200 and the
 *                title present in the page).
 *
 * Input:         SITE_URL (.env) + the slugs/titles Builder published
 * Output:        PASS (all articles live) or FAIL (with what went wrong)
 * Model:         Haiku-tier (HTTP check — no AI call needed)
 * Trigger:       After Publisher succeeds
 */

import 'dotenv/config';
import { log, writeLog } from '../shared/utils.mjs';

const WORKER = 'verifier';
const WAIT_MS = 60000;            // give Netlify time to build
const FETCH_TIMEOUT_MS = 20000;
const USER_AGENT = 'Mozilla/5.0 (compatible; Legata-Verify/1.0; +regulatory-intelligence-monitor)';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,*/*' }
    });
    const body = res.ok ? await res.text() : '';
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

export async function runVerifier({ articles = [], wait = true } = {}) {
  log(WORKER, 'info', 'Starting verification');

  const siteUrl = process.env.SITE_URL?.replace(/\/+$/, '');
  if (!siteUrl || siteUrl.includes('[your-site]')) {
    log(WORKER, 'warn', 'SITE_URL not set in .env — cannot verify live site');
    return { pass: false, reason: 'SITE_URL not set', results: [] };
  }

  if (wait) {
    log(WORKER, 'info', `Waiting ${WAIT_MS / 1000}s for Netlify to build…`);
    await sleep(WAIT_MS);
  }

  const results = [];

  // No specific articles → smoke-test the homepage
  if (articles.length === 0) {
    try {
      const { status } = await fetchPage(siteUrl + '/');
      const ok = status >= 200 && status < 400;
      results.push({ url: siteUrl + '/', status, ok });
      log(WORKER, ok ? 'ok' : 'error', `Homepage ${siteUrl}/ → HTTP ${status}`);
    } catch (err) {
      results.push({ url: siteUrl + '/', ok: false, error: err.message });
      log(WORKER, 'error', `Homepage unreachable: ${err.message}`);
    }
  }

  for (const a of articles) {
    const url = `${siteUrl}/articles/${a.slug}/`;
    try {
      const { status, body } = await fetchPage(url);
      const titlePresent = a.title ? body.includes(a.title) : true;
      const ok = status >= 200 && status < 400 && titlePresent;
      results.push({ slug: a.slug, url, status, titlePresent, ok });
      log(WORKER, ok ? 'ok' : 'error',
        `${url} → HTTP ${status}${a.title ? (titlePresent ? ', title found' : ', TITLE MISSING') : ''}`);
    } catch (err) {
      results.push({ slug: a.slug, url, ok: false, error: err.message });
      log(WORKER, 'error', `${url} unreachable: ${err.message}`);
    }
  }

  const pass = results.length > 0 && results.every(r => r.ok);
  log(WORKER, pass ? 'ok' : 'error', pass ? 'Verification PASS' : 'Verification FAIL');

  writeLog(WORKER, results);
  return { pass, results };
}

// Run standalone
if (process.argv[1]?.endsWith('verifier.mjs')) {
  runVerifier().catch(err => {
    log(WORKER, 'error', err.message);
    process.exit(1);
  });
}
