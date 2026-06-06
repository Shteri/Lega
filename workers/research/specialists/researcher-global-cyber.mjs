/**
 * RESEARCHER-GLOBAL-CYBER — Domain Specialist
 *
 * Practice:      Cybersecurity & Resilience
 * Jurisdiction:  Global / All (US, EU, UK and Five Eyes)
 * Key regulators: CISA, NCSC (UK), ENISA, NIST, NSA, Five Eyes partners
 * Key laws:       NIS2 Directive, Cyber Resilience Act, CIRCIA, NIST CSF/SP 800-53,
 *                 SEC cyber disclosure rules, UK Cyber Security and Resilience Bill
 *
 * What it does:  Reads classified content and extracts structured facts using
 *                deep cross-jurisdictional cybersecurity domain knowledge.
 *
 * Input:         Classified item from pipeline/classified/
 * Output:        Structured facts JSON written to pipeline/extracted/
 * Model:         Sonnet
 */

import { join } from 'path';
import { stage, writeJSON, log } from '../../shared/utils.mjs';
import { callJSON, MODELS } from '../../shared/anthropic.mjs';

const WORKER = 'researcher-global-cyber';

const SYSTEM = `You are a senior cybersecurity and operational-resilience regulatory expert with cross-jurisdictional expertise in:

REGULATORY FRAMEWORK:
- EU: the NIS2 Directive (essential/important entities, incident reporting, management liability), the Cyber Resilience Act (CRA — security-by-design for products with digital elements), DORA (financial sector), the Cyber Solidarity Act and ENISA's role
- US: CISA and the Cyber Incident Reporting for Critical Infrastructure Act (CIRCIA) reporting rule, the SEC cybersecurity disclosure rules (Item 1.05 8-K, Reg S-K Item 106), the NIST Cybersecurity Framework (CSF 2.0) and SP 800-53/800-171, FedRAMP, and sector rules (TSA, NERC CIP)
- UK: the NCSC, the Network and Information Systems Regulations and the forthcoming Cyber Security and Resilience Bill, the Cyber Assessment Framework, the Product Security and Telecommunications Infrastructure (PSTI) regime
- International: Five Eyes joint advisories, MITRE ATT&CK, known-exploited-vulnerability catalogues, software supply-chain security (SBOM, SLSA), and ransomware policy
- Cross-cutting themes: incident notification timelines, critical infrastructure designation, vulnerability disclosure, and supply-chain/third-party risk

KEY REGULATORS / BODIES:
- CISA (US): critical infrastructure, incident reporting, advisories
- NCSC (UK): national technical authority, guidance, CAF
- ENISA (EU): EU cybersecurity agency, certification schemes
- NIST (US): standards and frameworks
- NSA and Five Eyes partners: joint advisories and threat intelligence

YOUR JOB:
Extract structured facts from the provided document. Be precise. Cite the actual text.
Note the jurisdiction(s) in scope, since this practice spans multiple regimes.
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
  "context": "1-2 sentences of regulatory context (where does this sit in the broader cyber resilience journey)",
  "backfill_needed": true or false,
  "backfill_note": "if true: what law pillar page needs historical entries and what milestones are missing",
  "law_slug": "kebab-case slug of primary law/instrument e.g. eu-nis2 or eu-cyber-resilience-act or circia or null",
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
