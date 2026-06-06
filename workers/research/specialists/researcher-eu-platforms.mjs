/**
 * RESEARCHER-EU-PLATFORMS — Domain Specialist
 *
 * Practice:      Platforms, Competition & Online Markets
 * Jurisdiction:  European Union
 * Key regulators: European Commission (DG CONNECT, DG COMP), Digital Services Coordinators (DSCs)
 * Key laws:       Digital Services Act (DSA), Digital Markets Act (DMA),
 *                 P2B Regulation, Data Act, AVMSD, EU competition law (Arts 101/102 TFEU)
 *
 * What it does:  Reads classified content and extracts structured facts using
 *                deep EU platforms/competition regulatory domain knowledge.
 *
 * Input:         Classified item from pipeline/classified/
 * Output:        Structured facts JSON written to pipeline/extracted/
 * Model:         Sonnet
 */

import { join } from 'path';
import { stage, writeJSON, log } from '../../shared/utils.mjs';
import { callJSON, MODELS } from '../../shared/anthropic.mjs';

const WORKER = 'researcher-eu-platforms';

const SYSTEM = `You are a senior EU digital platforms and competition regulatory lawyer with deep expertise in:

REGULATORY FRAMEWORK:
- Digital Services Act (DSA, Regulation (EU) 2022/2065): tiered due-diligence obligations, the special regime for Very Large Online Platforms/Search Engines (VLOPs/VLOSEs), systemic risk assessments, transparency, the supervisory fee
- Digital Markets Act (DMA, Regulation (EU) 2022/1925): gatekeeper designation, core platform services, the do's and don'ts (self-preferencing, interoperability, anti-steering), compliance reports and specification proceedings
- DSA/DMA enforcement: Commission investigations, interim measures, periodic penalty payments and fines (up to 6% DSA / 10% DMA of global turnover)
- Platform-to-Business (P2B) Regulation, the Data Act, and AVMSD for video-sharing platforms
- Classic EU competition law: Articles 101/102 TFEU, abuse of dominance in digital markets, merger control (EUMR)
- The interaction with GDPR, the AI Act, and consumer protection (UCPD, the Digital Fairness Act consultation)

KEY REGULATORS:
- European Commission DG CONNECT: DSA VLOP/VLOSE supervision, DMA enforcement
- European Commission DG COMP: antitrust and merger enforcement
- Digital Services Coordinators (DSCs): national DSA enforcement for non-VLOP services
- The European Board for Digital Services

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
  "context": "1-2 sentences of regulatory context (where does this sit in the broader EU platforms journey)",
  "backfill_needed": true or false,
  "backfill_note": "if true: what law pillar page needs historical entries and what milestones are missing",
  "law_slug": "kebab-case slug of primary law/instrument e.g. eu-dsa or eu-dma or null",
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
