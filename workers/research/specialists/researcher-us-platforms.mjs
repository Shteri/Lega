/**
 * RESEARCHER-US-PLATFORMS — Domain Specialist
 *
 * Practice:      Platforms, Competition & Online Markets
 * Jurisdiction:  United States
 * Key regulators: DOJ Antitrust Division, FTC, Congress, FCC, state AGs
 * Key laws:       Sherman Act, Clayton Act, FTC Act, Section 230 (CDA),
 *                 state platform/social media laws, AICOA (proposed), KOSA (proposed)
 *
 * What it does:  Reads classified content and extracts structured facts using
 *                deep US platforms/competition regulatory domain knowledge.
 *
 * Input:         Classified item from pipeline/classified/
 * Output:        Structured facts JSON written to pipeline/extracted/
 * Model:         Sonnet
 */

import { join } from 'path';
import { stage, writeJSON, log } from '../../shared/utils.mjs';
import { callJSON, MODELS } from '../../shared/anthropic.mjs';

const WORKER = 'researcher-us-platforms';

const SYSTEM = `You are a senior US technology platforms, antitrust and competition lawyer with deep expertise in:

REGULATORY FRAMEWORK:
- Federal antitrust statutes: the Sherman Act (Sections 1 & 2 — restraints of trade, monopolization), the Clayton Act (mergers, Section 7), and the FTC Act (Section 5, unfair methods of competition)
- The landmark Big Tech cases: US v. Google (Search and Ad Tech), FTC v. Meta, US v. Apple, FTC v. Amazon — and the remedies phase
- Merger review: the 2023 DOJ/FTC Merger Guidelines, HSR premerger notification and the updated HSR form
- Content/intermediary liability: Section 230 of the Communications Decency Act, the NetChoice First Amendment cases, state social-media content-moderation laws (Texas HB 20, Florida SB 7072)
- Online child safety and design: KOSA (proposed), COPPA and the COPPA Rule update, state age-appropriate design codes
- Proposed legislation: AICOA (self-preferencing), the Open App Markets Act, the JCPA
- FCC's role on net neutrality and broadband/telecom platform issues

KEY REGULATORS:
- DOJ Antitrust Division: criminal and civil antitrust enforcement, monopolization cases
- FTC: competition and consumer-protection enforcement, rulemaking, merger review
- Congress: antitrust and platform legislation
- FCC: telecom/broadband, some platform-adjacent issues
- State Attorneys General: parallel antitrust suits and state platform laws

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
  "context": "1-2 sentences of regulatory context (where does this sit in the broader US platforms journey)",
  "backfill_needed": true or false,
  "backfill_note": "if true: what law pillar page needs historical entries and what milestones are missing",
  "law_slug": "kebab-case slug of primary law/instrument e.g. us-v-google-search or section-230 or null",
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
