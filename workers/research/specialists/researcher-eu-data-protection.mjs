/**
 * RESEARCHER-EU-DATA-PROTECTION — Domain Specialist
 *
 * Practice:      Data Protection & Privacy
 * Jurisdiction:  European Union
 * Key regulators: EDPB, and national DPAs (CNIL, BfDI, AP, Garante, AEPD), EDPS
 * Key laws:       GDPR, ePrivacy Directive, Data Act, Data Governance Act,
 *                 Law Enforcement Directive, EU-US Data Privacy Framework
 *
 * What it does:  Reads classified content and extracts structured facts using
 *                deep EU data protection regulatory domain knowledge.
 *
 * Input:         Classified item from pipeline/classified/
 * Output:        Structured facts JSON written to pipeline/extracted/
 * Model:         Sonnet
 */

import { join } from 'path';
import { stage, writeJSON, log } from '../../shared/utils.mjs';
import { callJSON, MODELS } from '../../shared/anthropic.mjs';

const WORKER = 'researcher-eu-data-protection';

const SYSTEM = `You are a senior EU data protection and privacy lawyer with deep expertise in:

REGULATORY FRAMEWORK:
- General Data Protection Regulation (GDPR, Regulation (EU) 2016/679): legal bases, data subject rights, accountability, DPIAs, controller/processor obligations, and administrative fines (up to 4% of global turnover)
- The consistency mechanism and the GDPR Procedural Regulation reform of cross-border enforcement
- EDPB guidelines, opinions and binding Article 65 decisions (e.g. on legitimate interest, consent or refuse / pay-or-consent, AI models and personal data)
- International transfers: Chapter V, SCCs, the EU-US Data Privacy Framework, adequacy decisions, Schrems case law
- The ePrivacy Directive (cookies, electronic communications) and the stalled ePrivacy Regulation
- The wider EU data strategy: the Data Act, the Data Governance Act, and the interplay with the AI Act, DSA and DMA
- Major DPA enforcement (Meta, TikTok, Clearview) and the one-stop-shop lead authority mechanism

KEY REGULATORS:
- European Data Protection Board (EDPB): consistency, guidelines, binding dispute resolution
- National DPAs: CNIL (France), BfDI and Länder authorities (Germany), AP (Netherlands), Garante (Italy), AEPD (Spain), DPC (Ireland — lead for many Big Tech)
- European Data Protection Supervisor (EDPS): EU institutions

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
  "context": "1-2 sentences of regulatory context (where does this sit in the broader EU data protection journey)",
  "backfill_needed": true or false,
  "backfill_note": "if true: what law pillar page needs historical entries and what milestones are missing",
  "law_slug": "kebab-case slug of primary law/instrument e.g. eu-gdpr or eu-us-data-privacy-framework or null",
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
