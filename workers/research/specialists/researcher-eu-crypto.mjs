/**
 * RESEARCHER-EU-CRYPTO — Domain Specialist
 *
 * Practice:      Crypto & Digital Assets
 * Jurisdiction:  European Union
 * Key regulators: ESMA, EBA, European Commission, ECB, national competent authorities (e.g. CySEC, BaFin, AMF)
 * Key laws:       MiCA (Regulation (EU) 2023/1114), Transfer of Funds Regulation (TFR),
 *                 DLT Pilot Regime, AMLR, DORA (for CASPs)
 *
 * What it does:  Reads classified content and extracts structured facts using
 *                deep EU crypto regulatory domain knowledge.
 *
 * Input:         Classified item from pipeline/classified/
 * Output:        Structured facts JSON written to pipeline/extracted/
 * Model:         Sonnet
 */

import { join } from 'path';
import { stage, writeJSON, log } from '../../shared/utils.mjs';
import { callJSON, MODELS } from '../../shared/anthropic.mjs';

const WORKER = 'researcher-eu-crypto';

const SYSTEM = `You are a senior EU crypto and digital assets regulatory lawyer with deep expertise in:

REGULATORY FRAMEWORK:
- Markets in Crypto-Assets Regulation (MiCA, Regulation (EU) 2023/1114) — the comprehensive EU crypto regime
- MiCA's structure: asset-referenced tokens (ARTs), e-money tokens (EMTs), other crypto-assets, and crypto-asset service providers (CASPs)
- The phased application: stablecoin (ART/EMT) rules from June 2024, CASP authorisation and full regime from December 2024, transitional "grandfathering" periods set by Member States
- ESMA and EBA Level 2/3 measures: RTS, ITS, guidelines on suitability, custody, conflicts, and significant token classification
- The Transfer of Funds Regulation (TFR) recast — the "travel rule" for crypto
- DLT Pilot Regime (Regulation (EU) 2022/858) for market infrastructures
- AML: application of the AMLR / AMLA framework to CASPs
- DORA operational resilience obligations for CASPs
- CASP passporting across the single market and reverse solicitation limits

KEY REGULATORS:
- ESMA: CASP-facing standards, market integrity, significant crypto-assets
- EBA: stablecoin (ART/EMT) issuer supervision, prudential and AML standards
- European Commission: delegated and implementing acts
- ECB: monetary and payment-system concerns on stablecoins
- National competent authorities (e.g. CySEC, BaFin, AMF) handling authorisation

YOUR JOB:
Extract structured facts from the provided document. Be precise. Cite the actual text.
Do not infer. Do not editorialize. Every claim must be traceable to the source.

Respond ONLY with a valid JSON object. No markdown, no explanation.`;

const USER_TEMPLATE = (item) => `
DOCUMENT DETAILS:
  Source:        ${item.source_name}
  Regulator:     ${item.classification?.regulator}
  Content type:  ${item.classification?.content_type}
  Title:         ${item.classification?.title_clean || item.title}
  URL:           ${item.url}
  Published:     ${item.published}
  Event date:    ${item.classification?.event_date}
  Depth:         ${item.classification?.depth}

RAW TEXT (up to 8000 chars):
${item.raw_text?.slice(0, 8000) || '[no content]'}

Extract the facts and respond with this exact JSON structure:
{
  "title": "clean, precise title for the article",
  "summary": "one paragraph (3-5 sentences) plain-English description of what happened and why it matters",
  "key_points": [
    "Complete sentence fact 1 — precise, citable",
    "Complete sentence fact 2",
    "Complete sentence fact 3"
  ],
  "numbers": ["any specific thresholds, fines, dates, percentages from the document"],
  "effective_dates": [
    { "date": "YYYY-MM-DD", "description": "what takes effect" }
  ],
  "affected_entities": ["who is directly affected by this"],
  "related_laws": ["primary legislation and instruments referenced"],
  "context": "1-2 sentences of regulatory context (where does this sit in the broader EU crypto journey)",
  "backfill_needed": true or false,
  "backfill_note": "if true: what law pillar page needs historical entries and what milestones are missing",
  "law_slug": "kebab-case slug of primary law/instrument e.g. eu-mica-2023-1114 or null",
  "primary_sources": [
    { "label": "document name", "url": "direct link" }
  ]
}`;

export async function runSpecialist(classifiedItem) {
  log(WORKER, 'info', `Extracting facts: ${classifiedItem.classification?.title_clean || classifiedItem.title}`);

  let facts;
  try {
    facts = await callJSON({
      model:     MODELS.sonnet,
      system:    SYSTEM,
      user:      USER_TEMPLATE(classifiedItem),
      maxTokens: 2000
    });
  } catch (err) {
    log(WORKER, 'error', `Extraction failed: ${err.message}`);
    throw err;
  }

  const extracted = {
    id:           classifiedItem.id,
    source_url:   classifiedItem.url,
    fetched_at:   classifiedItem.fetched_at,
    discovered_at:classifiedItem.discovered_at,
    specialist:   WORKER,

    classification: {
      sector:       classifiedItem.classification.sector,
      content_type: classifiedItem.classification.content_type,
      jurisdiction: classifiedItem.classification.jurisdiction,
      regulator:    classifiedItem.classification.regulator,
      depth:        classifiedItem.classification.depth
    },

    item: {
      title:      facts.title,
      event_date: classifiedItem.classification.event_date,
      law_slug:   facts.law_slug || null
    },

    facts: {
      summary:           facts.summary,
      key_points:        facts.key_points,
      numbers:           facts.numbers || [],
      effective_dates:   facts.effective_dates || [],
      affected_entities: facts.affected_entities || [],
      related_laws:      facts.related_laws || [],
      context:           facts.context
    },

    backfill_needed: facts.backfill_needed || false,
    backfill_note:   facts.backfill_note || null,
    is_update:       false,
    primary_sources: facts.primary_sources || [{ label: classifiedItem.source_name, url: classifiedItem.url }],

    extracted_at: new Date().toISOString()
  };

  // Write to pipeline/extracted/
  const outFile = join(stage('extracted'), `${classifiedItem.id}.json`);
  writeJSON(outFile, extracted);
  log(WORKER, 'ok', `Extracted → ${outFile}`);

  return extracted;
}
