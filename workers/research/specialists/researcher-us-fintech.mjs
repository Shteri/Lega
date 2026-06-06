/**
 * RESEARCHER-US-FINTECH — Domain Specialist
 *
 * Practice:      Fintech & Financial Services
 * Jurisdiction:  United States
 * Key regulators: OCC, FDIC, Federal Reserve, CFPB, NCUA, FinCEN, state regulators (NYDFS, CSBS)
 * Key laws:       Bank Secrecy Act, Dodd-Frank, EFTA/Reg E, TILA/Reg Z, GLBA,
 *                 CFPB Section 1033 (open banking), bank-fintech partnership guidance, money transmitter laws
 *
 * What it does:  Reads classified content and extracts structured facts using
 *                deep US fintech regulatory domain knowledge.
 *
 * Input:         Classified item from pipeline/classified/
 * Output:        Structured facts JSON written to pipeline/extracted/
 * Model:         Sonnet
 */

import { join } from 'path';
import { stage, writeJSON, log } from '../../shared/utils.mjs';
import { callJSON, MODELS } from '../../shared/anthropic.mjs';

const WORKER = 'researcher-us-fintech';

const SYSTEM = `You are a senior US fintech and financial services regulatory lawyer with deep expertise in:

REGULATORY FRAMEWORK:
- The dual federal/state banking system and the "alphabet soup" of prudential regulators
- Open banking: CFPB Section 1033 Personal Financial Data Rights rule (Dodd-Frank)
- Bank-fintech partnerships ("Banking-as-a-Service"), third-party risk management interagency guidance, the Synapse fallout
- Consumer protection: EFTA/Regulation E, TILA/Regulation Z, FCRA, the CFPB's UDAAP authority, overdraft and BNPL rules
- AML/BSA: Bank Secrecy Act, FinCEN reporting (SARs/CTRs), beneficial ownership / Corporate Transparency Act
- Money transmission: state money transmitter licensing, the Money Transmission Modernization Act, NYDFS
- Privacy/data: Gramm-Leach-Bliley Act (GLBA) Safeguards Rule
- Payments and stablecoins where they touch banking (master accounts, novel charters)

KEY REGULATORS:
- OCC: national banks, fintech charters
- FDIC: state non-member banks, deposit insurance, brokered deposits
- Federal Reserve: bank holding companies, payments, master accounts
- CFPB: consumer financial protection, Section 1033, UDAAP
- NCUA: credit unions
- FinCEN: AML/BSA, beneficial ownership
- State regulators: NYDFS, CSBS, money transmitter licensing

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
  "context": "1-2 sentences of regulatory context (where does this sit in the broader US fintech journey)",
  "backfill_needed": true or false,
  "backfill_note": "if true: what law pillar page needs historical entries and what milestones are missing",
  "law_slug": "kebab-case slug of primary law/instrument e.g. cfpb-1033-open-banking or null",
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
