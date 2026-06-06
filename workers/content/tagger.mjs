/**
 * TAGGER — Chief of Content
 *
 * What it does:  Audits and corrects the frontmatter on a drafted article.
 *                Validates the classification fields against the schema's
 *                controlled vocabularies (sector, content_type, jurisdiction,
 *                regulator short name) and normalises the tags. Dates, flags
 *                and primary_sources are preserved as-is.
 *
 * Input:         pipeline/drafted/[slug].md
 * Output:        pipeline/ready/[slug].md   (corrected frontmatter)
 * Model:         Sonnet (validation judgment)
 * Trigger:       Automatically after Writer finishes
 */

import { readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import {
  stage, writeText, buildArticle, parseFrontmatter,
  advanceFile, ensureDir, log, writeLog
} from '../shared/utils.mjs';
import { callJSON, MODELS } from '../shared/anthropic.mjs';

const WORKER = 'tagger';

const SYSTEM = `You are the frontmatter validator for RegWatch. You audit and correct
the classification metadata on an article so it conforms exactly to the schema.

VALID SECTOR CODES:
  AI = Artificial Intelligence
  FT = Fintech & Digital Finance
  CR = Crypto & Digital Assets
  PL = Platforms & Content Law
  PV = Privacy & Data Protection
  GG = Gambling & Gaming
  CY = Cybersecurity

VALID CONTENT_TYPE CODES:
  LEG = Legislation              BILL = Bill / Draft Legislation
  RULE = Rulemaking              RTS = Technical Standards
  QA = Q&A / Clarification       GUID = Guidance
  NOAC = No-Action / Relief      SUPV = Supervisory Communication
  ENF = Enforcement             CONS = Consultation / Call for Evidence
  SPCH = Speech                  PR = Press Release
  RPT = Report / Study           LIC = Licensing Decision
  ALRT = Alert / Advisory        HRNG = Hearing / Parliamentary

VALID JURISDICTION CODES:
  EU, US, UK, US-STATE, GLOBAL

RULES:
- Output codes EXACTLY as listed above (correct case). Never invent a new code.
- "regulator" must be the regulator's short name (e.g. FCA, SEC, ESMA, ICO, CMA, EU AI Office). Fix obvious long-form names to their short name.
- "tags" must be 3–6 short, lowercase, kebab-case topic tags. Deduplicate and tidy them.
- If a value is already valid, return it unchanged.
- Base your judgment on the title, body and the supplied current values.

Respond ONLY with a valid JSON object. No markdown fences, no explanation.`;

const USER_TEMPLATE = (data, body) => `
CURRENT FRONTMATTER VALUES:
  title:        ${data.title}
  sector:       ${data.sector}
  content_type: ${data.content_type}
  jurisdiction: ${data.jurisdiction}
  regulator:    ${data.regulator}
  law_slug:     ${data.law_slug || '(none)'}
  tags:         ${(data.tags || []).join(', ') || '(none)'}

ARTICLE BODY (for context, up to 4000 chars):
${(body || '').slice(0, 4000)}

Return the corrected classification fields with this exact JSON structure:
{
  "sector": "one of AI|FT|CR|PL|PV|GG|CY",
  "content_type": "one of the valid content type codes",
  "jurisdiction": "one of EU|US|UK|US-STATE|GLOBAL",
  "regulator": "regulator short name",
  "tags": ["3-6 kebab-case tags"]
}`;

export async function runTagger() {
  log(WORKER, 'info', 'Starting tagger run');

  const draftedDir = stage('drafted');
  const readyDir   = stage('ready');
  ensureDir(readyDir);

  let files;
  try {
    files = readdirSync(draftedDir).filter((f) => f.endsWith('.md'));
  } catch {
    log(WORKER, 'info', 'pipeline/drafted/ is empty — nothing to tag');
    return [];
  }

  if (files.length === 0) {
    log(WORKER, 'info', 'No drafted articles to tag');
    return [];
  }

  const logEntries = [];
  const tagged     = [];

  for (const file of files) {
    const filePath = join(draftedDir, file);
    const md       = readFileSync(filePath, 'utf8');
    const { data, body } = parseFrontmatter(md);

    log(WORKER, 'info', `Tagging: ${data.title?.slice(0, 60)}`);

    let fix;
    try {
      fix = await callJSON({
        model:     MODELS.sonnet,
        system:    SYSTEM,
        user:      USER_TEMPLATE(data, body),
        maxTokens: 1000
      });
    } catch (err) {
      log(WORKER, 'error', `Tagging failed for ${file}: ${err.message}`);
      logEntries.push({ file, status: 'error', error: err.message });
      continue;
    }

    // Merge corrected classification over the existing frontmatter
    const corrected = {
      ...data,
      sector:       fix.sector       || data.sector,
      content_type: fix.content_type || data.content_type,
      jurisdiction: fix.jurisdiction || data.jurisdiction,
      regulator:    fix.regulator    || data.regulator,
      tags:         (fix.tags && fix.tags.length) ? fix.tags : data.tags
    };

    const outFile = join(readyDir, basename(file));
    writeText(outFile, buildArticle(corrected, body));
    log(WORKER, 'ok', `Ready → ${outFile}`);

    tagged.push({ file: outFile, title: corrected.title, backfill_needed: corrected.backfill_needed });
    logEntries.push({
      file,
      status: 'tagged',
      before: { sector: data.sector, content_type: data.content_type, jurisdiction: data.jurisdiction, regulator: data.regulator },
      after:  { sector: corrected.sector, content_type: corrected.content_type, jurisdiction: corrected.jurisdiction, regulator: corrected.regulator }
    });

    // Consume the drafted file
    advanceFile(filePath, 'logs');
  }

  log(WORKER, 'ok', `Tagger complete — ${tagged.length} article(s) ready`);
  writeLog(WORKER, logEntries);
  return tagged;
}

// Run standalone
if (process.argv[1]?.endsWith('tagger.mjs')) {
  runTagger().catch((err) => {
    log(WORKER, 'error', err.message);
    process.exit(1);
  });
}
