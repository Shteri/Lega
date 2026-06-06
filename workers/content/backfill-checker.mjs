/**
 * BACKFILL CHECKER — Chief of Content
 *
 * What it does:  For an article that is part of an ongoing matter
 *                (backfill_needed: true), works out which historical
 *                milestones the law's pillar page should already contain so
 *                Chief of Data can fill the gaps.
 *
 * Input:         pipeline/ready/[slug].md   (after Tagger), backfill_needed=true
 * Output:        pipeline/backfill/[slug]-backfill.json   (for Chief of Data)
 * Model:         Sonnet (historical gap detection)
 * Trigger:       After Tagger, only for articles with backfill_needed=true
 */

import { readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import {
  stage, writeJSON, parseFrontmatter,
  ensureDir, log, writeLog
} from '../shared/utils.mjs';
import { callJSON, MODELS } from '../shared/anthropic.mjs';

const WORKER = 'backfill-checker';

const SYSTEM = `You are a regulatory historian for RegWatch. Each major law or instrument
has a "pillar page" — a timeline of its key milestones (proposal, consultation,
adoption, entry into force, phased application dates, major guidance, major
enforcement). Given an article about an ongoing matter, you identify the
historical milestones that pillar page should contain.

RULES:
- List the milestones that belong on this law's pillar page, in chronological order.
- For each milestone give an approximate date (YYYY-MM-DD or YYYY-MM or YYYY) and a one-line description.
- Mark each milestone as likely "covered" by this article or "missing" (a gap to backfill).
- Be precise and factual. If you are not confident a milestone occurred, omit it rather than invent one.
- Focus on the law identified by law_slug / related laws in the article.

Respond ONLY with a valid JSON object. No markdown fences, no explanation.`;

const USER_TEMPLATE = (data, body) => `
ARTICLE FRONTMATTER:
  title:        ${data.title}
  law_slug:     ${data.law_slug || '(none)'}
  regulator:    ${data.regulator}
  jurisdiction: ${data.jurisdiction}
  event_date:   ${data.event_date}

ARTICLE BODY (up to 4000 chars):
${(body || '').slice(0, 4000)}

Return this exact JSON structure:
{
  "law_slug": "the pillar page slug this backfill targets",
  "law_name": "full name of the law/instrument",
  "milestones": [
    { "date": "YYYY-MM-DD", "description": "what happened", "status": "covered" or "missing" }
  ],
  "missing_count": 0,
  "notes": "one or two sentences on what the pillar page is missing"
}`;

export async function runBackfillChecker() {
  log(WORKER, 'info', 'Starting backfill check');

  const readyDir    = stage('ready');
  const backfillDir = stage('backfill');
  ensureDir(backfillDir);

  let files;
  try {
    files = readdirSync(readyDir).filter((f) => f.endsWith('.md'));
  } catch {
    log(WORKER, 'info', 'pipeline/ready/ is empty — nothing to check');
    return [];
  }

  if (files.length === 0) {
    log(WORKER, 'info', 'No ready articles to check');
    return [];
  }

  const logEntries = [];
  const reports    = [];

  for (const file of files) {
    const filePath = join(readyDir, file);
    const md       = readFileSync(filePath, 'utf8');
    const { data, body } = parseFrontmatter(md);

    // Only run for articles flagged as part of an ongoing matter
    if (data.backfill_needed !== true) {
      logEntries.push({ file, status: 'skipped', reason: 'backfill_needed=false' });
      continue;
    }

    log(WORKER, 'info', `Checking backfill: ${data.title?.slice(0, 60)}`);

    let report;
    try {
      report = await callJSON({
        model:     MODELS.sonnet,
        system:    SYSTEM,
        user:      USER_TEMPLATE(data, body),
        maxTokens: 2000
      });
    } catch (err) {
      log(WORKER, 'error', `Backfill check failed for ${file}: ${err.message}`);
      logEntries.push({ file, status: 'error', error: err.message });
      continue;
    }

    const slug = basename(file, '.md');
    const out  = {
      slug,
      source_article: file,
      law_slug:   report.law_slug || data.law_slug || null,
      law_name:   report.law_name || null,
      regulator:  data.regulator,
      milestones: report.milestones || [],
      missing_count: report.missing_count ?? (report.milestones || []).filter((m) => m.status === 'missing').length,
      notes:      report.notes || null,
      checked_at: new Date().toISOString()
    };

    const outFile = join(backfillDir, `${slug}-backfill.json`);
    writeJSON(outFile, out);
    log(WORKER, 'ok', `Backfill report → ${outFile} (${out.missing_count} missing)`);

    reports.push(out);
    logEntries.push({ file, status: 'reported', slug, missing_count: out.missing_count });
  }

  log(WORKER, 'ok', `Backfill check complete — ${reports.length} report(s)`);
  writeLog(WORKER, logEntries);
  return reports;
}

// Run standalone
if (process.argv[1]?.endsWith('backfill-checker.mjs')) {
  runBackfillChecker().catch((err) => {
    log(WORKER, 'error', err.message);
    process.exit(1);
  });
}
