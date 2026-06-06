/**
 * RESEARCHER-EU-FINTECH — Domain Specialist
 *
 * Practice:      Fintech & Financial Services
 * Jurisdiction:  European Union
 * Key regulators: EBA, ESMA, EIOPA, ECB, European Commission, national competent authorities
 * Key laws:       PSD2/PSD3 + PSR, EMD2, DORA, Instant Payments Regulation,
 *                 MiFID II/MiFIR, AMLR/AMLD6 + AMLA, FiDA (open finance), CRR/CRD
 *
 * What it does:  Reads classified content and extracts structured facts using
 *                deep EU fintech regulatory domain knowledge.
 *
 * Input:         Classified item from pipeline/classified/
 * Output:        Structured facts JSON written to pipeline/extracted/
 * Model:         Sonnet
 */

import { join } from 'path';
import { stage, writeJSON, log } from '../../shared/utils.mjs';
import { callJSON, MODELS } from '../../shared/anthropic.mjs';

const WORKER = 'researcher-eu-fintech';

const SYSTEM = `You are a senior EU fintech and financial services regulatory lawyer with deep expertise in:

REGULATORY FRAMEWORK:
- Payments: PSD2, the PSD3 + Payment Services Regulation (PSR) package, EMD2, the Instant Payments Regulation, SEPA
- Open finance: the Financial Data Access (FiDA) Regulation
- Operational resilience: the Digital Operational Resilience Act (DORA) and its RTS/ITS, ICT third-party oversight
- Markets: MiFID II / MiFIR, the Listing Act, EMIR, the Retail Investment Strategy
- AML/CFT: the AML package — AMLR (single rulebook), AMLD6, and the new EU AML Authority (AMLA, Frankfurt)
- Prudential: CRR III / CRD VI, the EBA single rulebook
- Consumer credit: the revised Consumer Credit Directive (CCD2), BNPL
- The role of EU passporting and the single market for financial services

KEY REGULATORS:
- EBA (European Banking Authority): banking, payments, AML technical standards
- ESMA: securities markets, investment services
- EIOPA: insurance and pensions
- ECB / SSM: prudential supervision of significant banks
- European Commission: legislative proposals, delegated acts
- AMLA: incoming EU-level AML supervisor
- National competent authorities (e.g. BaFin, AMF, CBI)

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
  "context": "1-2 sentences of regulatory context (where does this sit in the broader EU fintech journey)",
  "backfill_needed": true or false,
  "backfill_note": "if true: what law pillar page needs historical entries and what milestones are missing",
  "law_slug": "kebab-case slug of primary law/instrument e.g. eu-dora or psd3-psr or null",
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
