/**
 * CLASSIFIER — Chief of Research
 *
 * What it does:  Reads raw text and classifies:
 *                  - sector (7 options)
 *                  - content_type (16 options)
 *                  - jurisdiction
 *                  - regulator (short name)
 *                  - depth: 'full-article' or 'data-entry'
 *
 * Input:         pipeline/raw/[id].json
 * Output:        pipeline/classified/[id].json
 * Model:         Sonnet (taxonomy judgment)
 * Trigger:       New file in pipeline/raw/
 */

import { readdirSync } from 'fs';
import { join } from 'path';
import {
  stage, readJSON, writeJSON, advanceFile,
  ensureDir, log, writeLog
} from '../shared/utils.mjs';
import { callJSON, MODELS } from '../shared/anthropic.mjs';

const WORKER = 'classifier';

const SYSTEM = `You are the RegWatch Classifier. You classify regulatory publications into a strict taxonomy.

SECTORS (pick the single best fit):
- AI  = Artificial Intelligence (agentic AI, foundation models, high-risk systems, sector-specific AI rules)
- FT  = Fintech & Digital Finance (payments, banking, e-money, stablecoins, open banking)
- CR  = Crypto & Digital Assets (token issuance, trading, custody, DeFi, market structure)
- PL  = Platforms & Content Law (DSA/DMA, OSA, antitrust, content moderation, age assurance)
- PV  = Privacy & Data Protection (GDPR, CCPA, cookies, data brokers)
- GG  = Gambling & Gaming (online/offline gambling, sweepstakes, prediction markets)
- CY  = Cybersecurity (DORA, NIS2, CRA, operational resilience, incidents, advisories)

CONTENT TYPES (pick the single best fit):
- LEG   = Enacted legislation / statute
- BILL  = Bill or draft legislation in progress
- RULE  = NPRM, final rule, delegated/implementing act
- RTS   = Technical standard (RTS, ITS, FIPS, NIST SP, ENISA technical guideline)
- QA    = Q&A database entry or formal staff clarification
- GUID  = Guidance (policy statement, bulletin, circular, Dear CEO letter)
- NOAC  = No-action letter, exemptive order, safe harbor
- SUPV  = Supervisory communication (SR letter, supervisory notice, portfolio letter)
- ENF   = Enforcement (fine, consent order, final notice, license revocation)
- CONS  = Consultation or call for evidence
- SPCH  = Speech by senior official
- PR    = Press release or official announcement
- RPT   = Report or study (thematic review, market study, annual report)
- LIC   = Licensing decision (grant, renewal, rejection, suspension, revocation)
- ALRT  = Alert or advisory (cybersecurity alert, investor warning, consumer warning)
- HRNG  = Hearing or parliamentary output (testimony, committee report, parliamentary question)

JURISDICTIONS: EU, US, UK, US-STATE, GLOBAL

DEPTH DECISION (critical):
- full-article: Major enforcement action (fine >£100k or significant precedent), new law enacted or major rulemaking finalized, landmark guidance that changes industry practice, major market study or thematic review, parliamentary output that materially advances a tracked bill
- data-entry: Routine press release, routine speech, minor guidance, standard licensing decision, low-value enforcement, advisory/alert (unless systemic), consultation opened

Respond ONLY with a valid JSON object. No markdown, no explanation.`;

const USER_TEMPLATE = (item) => `
SOURCE: ${item.source_name} (${item.jurisdiction})
TITLE: ${item.title}
URL: ${item.url}
PUBLISHED: ${item.published}
SUMMARY FROM FEED: ${item.summary}

RAW TEXT (first 3000 chars):
${item.raw_text?.slice(0, 3000) || '[no content]'}

Classify this item and respond with:
{
  "sector": "...",
  "content_type": "...",
  "jurisdiction": "...",
  "regulator": "short name e.g. FCA",
  "depth": "full-article" or "data-entry",
  "title_clean": "clean article title",
  "event_date": "YYYY-MM-DD or null",
  "reasoning": "one sentence explaining the depth decision"
}`;

export async function runClassifier() {
  log(WORKER, 'info', 'Starting classification run');

  const rawDir        = stage('raw');
  const classifiedDir = stage('classified');
  ensureDir(classifiedDir);

  let files;
  try {
    files = readdirSync(rawDir).filter(f => f.endsWith('.json'));
  } catch {
    log(WORKER, 'info', 'pipeline/raw/ is empty — nothing to classify');
    return [];
  }

  if (!files || files.length === 0) {
    log(WORKER, 'info', 'pipeline/raw/ is empty — nothing to classify');
    return [];
  }

  const logEntries    = [];
  const allClassified = [];

  for (const file of files) {
    const filePath = join(rawDir, file);
    const item     = readJSON(filePath);

    log(WORKER, 'info', `Classifying: ${item.title?.slice(0, 60)}`);

    let classification;
    try {
      classification = await callJSON({
        model:  MODELS.sonnet,
        system: SYSTEM,
        user:   USER_TEMPLATE(item),
        maxTokens: 500
      });
    } catch (err) {
      log(WORKER, 'error', `Failed to classify ${file}: ${err.message}`);
      logEntries.push({ file, status: 'error', error: err.message });
      continue;
    }

    const classified = {
      ...item,
      classification,
      classified_at: new Date().toISOString()
    };

    const outFile = join(classifiedDir, file);
    writeJSON(outFile, classified);
    allClassified.push(classified);

    logEntries.push({
      file,
      status: 'ok',
      sector: classification.sector,
      content_type: classification.content_type,
      depth: classification.depth
    });

    log(WORKER, 'ok',
      `${file} → ${classification.sector}/${classification.content_type}/${classification.jurisdiction} [${classification.depth}]`
    );

    advanceFile(filePath, 'logs');
    await new Promise(r => setTimeout(r, 300));
  }

  log(WORKER, 'ok', `Classified ${allClassified.length} items → pipeline/classified/`);
  writeLog(WORKER, logEntries);
  return allClassified;
}

// Run standalone
if (process.argv[1]?.endsWith('classifier.mjs')) {
  runClassifier().catch(err => {
    log(WORKER, 'error', err.message);
    process.exit(1);
  });
}
