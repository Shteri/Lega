/**
 * SCORER — Chief of Wire
 *
 * What it does:  Scores each new wire item for relevance to Legata's coverage:
 *                the 7 sectors, the tracked jurisdictions, and whether a tracked
 *                regulator is involved. Refines the sector/jurisdiction tags and
 *                attaches a 0–1 relevance score. Items below the threshold are
 *                discarded here and never reach the site.
 *
 * Input:         pipeline/wire-new/[timestamp].json
 * Output:        pipeline/wire-scored/[timestamp].json   (items scoring >= 0.6)
 * Model:         Sonnet (relevance judgment)
 * Trigger:       After Wire Deduper
 */

import { readdirSync } from 'fs';
import { join } from 'path';
import {
  ROOT, stage, readJSON, writeJSON, advanceFile,
  ensureDir, timestampId, log, writeLog
} from '../shared/utils.mjs';
import { callJSON, MODELS } from '../shared/anthropic.mjs';

const WORKER = 'scorer';
const THRESHOLD = 0.6; // per wire-item-schema.md — below this is discarded

const SECTORS = {
  AI: 'Artificial Intelligence',
  FT: 'Fintech & Digital Finance',
  CR: 'Crypto & Digital Assets',
  PL: 'Platforms & Content Law',
  PV: 'Privacy & Data Protection',
  GG: 'Gambling & Gaming',
  CY: 'Cybersecurity'
};
const JURISDICTIONS = ['EU', 'US', 'UK', 'US-STATE', 'GLOBAL'];

// Tracked regulator short names, pulled from the regulator source list.
function loadRegulators() {
  try {
    const names = readJSON(join(ROOT, 'docs', 'regulator-sources.json')).map(s => s.name);
    return [...new Set(names)].sort();
  } catch {
    return [];
  }
}

const SYSTEM = (regulators) => `You score trade-press headlines for a regulatory-intelligence wire called Legata.

Legata covers REGULATORY, LEGAL, ENFORCEMENT and POLICY developments in these 7 sectors:
${Object.entries(SECTORS).map(([c, n]) => `  ${c} = ${n}`).join('\n')}

Tracked jurisdictions: ${JURISDICTIONS.join(', ')}.
Tracked regulators (examples): ${regulators.slice(0, 60).join(', ')}.

Score relevance from 0 to 1:
- 1.0 = squarely about regulation/legislation/enforcement/litigation/policy in a tracked sector
- 0.6–0.9 = clearly regulatory-adjacent in a tracked sector
- 0.3–0.5 = sector news with only a loose policy angle
- 0.0–0.2 = product launches, funding rounds, price moves, marketing — NOT regulatory

Only reward genuine regulatory/legal/policy signal. Plain business or market news scores low.

Respond ONLY with a valid JSON object. No markdown, no explanation.`;

const USER_TEMPLATE = (item) => `
SOURCE:      ${item.source_name}
CANDIDATE SECTORS (from source): ${(item.sectors || []).join(', ')}
TITLE:       ${item.title}
SUMMARY:     ${item.summary || '(none)'}
PUBLISHED:   ${item.published}

Return this exact JSON:
{
  "score": 0.0,
  "sectors": ["matching sector codes from AI|FT|CR|PL|PV|GG|CY"],
  "jurisdictions": ["matching codes from EU|US|UK|US-STATE|GLOBAL"],
  "regulators": ["any tracked regulator short names mentioned, else empty"]
}`;

export async function runScorer() {
  log(WORKER, 'info', 'Starting scoring run');

  const newDir    = stage('wire-new');
  const scoredDir = stage('wire-scored');
  ensureDir(scoredDir);

  let files;
  try {
    files = readdirSync(newDir).filter(f => f.endsWith('.json'));
  } catch {
    log(WORKER, 'info', 'pipeline/wire-new/ is empty — nothing to score');
    return [];
  }
  if (files.length === 0) {
    log(WORKER, 'info', 'No new wire items to score');
    return [];
  }

  const regulators = loadRegulators();
  const system     = SYSTEM(regulators);
  const logEntries = [];
  const kept       = [];
  let scored = 0, dropped = 0;

  for (const file of files) {
    const filePath = join(newDir, file);
    const items = readJSON(filePath);

    for (const item of items) {
      let result;
      try {
        result = await callJSON({
          model:     MODELS.sonnet,
          system,
          user:      USER_TEMPLATE(item),
          maxTokens: 400
        });
      } catch (err) {
        log(WORKER, 'error', `Scoring failed: ${item.title?.slice(0, 50)} — ${err.message}`);
        logEntries.push({ title: item.title?.slice(0, 60), status: 'error', error: err.message });
        continue;
      }

      const score = typeof result.score === 'number' ? result.score : 0;
      scored++;

      if (score < THRESHOLD) {
        dropped++;
        logEntries.push({ title: item.title?.slice(0, 60), score, status: 'dropped' });
        continue;
      }

      kept.push({
        ...item,
        score,
        sectors:       (result.sectors && result.sectors.length) ? result.sectors : item.sectors,
        jurisdictions: (result.jurisdictions && result.jurisdictions.length) ? result.jurisdictions : [item.jurisdiction],
        regulators:    result.regulators || []
      });
      logEntries.push({ title: item.title?.slice(0, 60), score, status: 'kept' });
    }

    // Consume the new batch
    advanceFile(filePath, 'logs');
  }

  log(WORKER, 'ok', `Scoring complete — ${kept.length} kept, ${dropped} dropped (of ${scored} scored)`);

  if (kept.length > 0) {
    const outFile = join(scoredDir, `${timestampId()}.json`);
    writeJSON(outFile, kept);
    log(WORKER, 'ok', `Wrote ${kept.length} scored items → ${outFile}`);
  }

  writeLog(WORKER, logEntries);
  return kept;
}

// Run standalone
if (process.argv[1]?.endsWith('scorer.mjs')) {
  runScorer().catch(err => {
    log(WORKER, 'error', err.message);
    process.exit(1);
  });
}
