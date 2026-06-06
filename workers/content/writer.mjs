/**
 * WRITER — Chief of Content
 *
 * What it does:  Takes structured facts from pipeline/inbox/ and writes a
 *                publication-ready article (frontmatter + markdown body).
 *                Frontmatter is derived deterministically from the facts;
 *                the title, tags and prose body come from Opus.
 *                NO domain knowledge — it only restates the supplied facts.
 *
 * Input:         pipeline/inbox/[id].json   (extracted-facts schema)
 * Output:        pipeline/drafted/[slug].md
 * Model:         Opus (writing quality is the product)
 * Trigger:       New file in pipeline/inbox/ OR user says "write an article"
 */

import { readdirSync } from 'fs';
import { join } from 'path';
import {
  stage, readJSON, writeText, buildArticle, slugify, today,
  advanceFile, ensureDir, log, writeLog
} from '../shared/utils.mjs';
import { callJSON, MODELS } from '../shared/anthropic.mjs';

const WORKER = 'writer';

const SYSTEM = `You are the staff writer for RegWatch, a regulatory intelligence publication.

You turn a structured facts object into a clear, publication-ready article body.

EDITORIAL STANDARDS:
- Plain English. Short sentences. No jargon left unexplained.
- Factual and neutral. NO editorializing adjectives ("significant", "landmark", "sweeping", "crackdown").
- Restate ONLY the facts you are given. Do not add, infer, or invent detail, dates, figures, or quotes.
- Every figure, date and threshold must come from the supplied facts.
- British English spelling.

ARTICLE BODY STRUCTURE (use these exact markdown headings, in this order):
## Key Takeaways
A numbered list of 3–7 items. Each item is one complete sentence.

## Background
1–3 short paragraphs of context (use the supplied context and related laws).

## Developments
The specific event: the detail, the numbers, the dates, who is affected.

## What to Watch
Optional. Include ONLY if the facts indicate an ongoing matter, upcoming
effective dates, or a consultation/next step. Otherwise omit this section entirely.

Do NOT include the title as an H1, and do NOT restate the primary sources in the
body — they live in the frontmatter.

Respond ONLY with a valid JSON object. No markdown fences, no explanation.`;

const USER_TEMPLATE = (f) => `
Write the article from these facts.

PROPOSED TITLE: ${f.item?.title || ''}
REGULATOR:      ${f.classification?.regulator || ''}
JURISDICTION:   ${f.classification?.jurisdiction || ''}
EVENT DATE:     ${f.item?.event_date || ''}

SUMMARY:
${f.facts?.summary || ''}

KEY POINTS:
${(f.facts?.key_points || []).map((p) => `- ${p}`).join('\n') || '- (none)'}

NUMBERS / THRESHOLDS:
${(f.facts?.numbers || []).map((n) => `- ${n}`).join('\n') || '- (none)'}

EFFECTIVE DATES:
${(f.facts?.effective_dates || []).map((d) => `- ${d.date}: ${d.description}`).join('\n') || '- (none)'}

AFFECTED ENTITIES:
${(f.facts?.affected_entities || []).map((e) => `- ${e}`).join('\n') || '- (none)'}

RELATED LAWS:
${(f.facts?.related_laws || []).map((l) => `- ${l}`).join('\n') || '- (none)'}

CONTEXT:
${f.facts?.context || ''}

Respond with this exact JSON structure:
{
  "title": "a clean, precise, headline-style title (no trailing period)",
  "tags": ["3-6 short kebab-case topic tags drawn from the facts"],
  "body": "the full markdown article body as a single string, using the required ## headings and \\n for line breaks"
}`;

/**
 * Build the frontmatter object deterministically from the facts +
 * the Opus-written title/tags.
 */
function buildFrontmatter(facts, drafted) {
  return {
    title:           drafted.title || facts.item?.title,
    layout:          'article.njk',
    sector:          facts.classification?.sector,
    content_type:    facts.classification?.content_type,
    jurisdiction:    facts.classification?.jurisdiction,
    event_date:      facts.item?.event_date,
    pub_date:        today(),
    regulator:       facts.classification?.regulator,
    law_slug:        facts.item?.law_slug || null,
    tags:            drafted.tags || [],
    backfill_needed: facts.backfill_needed || false,
    is_update:       facts.is_update || false,
    primary_sources: facts.primary_sources || []
  };
}

export async function runWriter() {
  log(WORKER, 'info', 'Starting writer run');

  const inboxDir   = stage('inbox');
  const draftedDir = stage('drafted');
  ensureDir(draftedDir);

  let files;
  try {
    files = readdirSync(inboxDir).filter((f) => f.endsWith('.json'));
  } catch {
    log(WORKER, 'info', 'pipeline/inbox/ is empty — nothing to write');
    return [];
  }

  if (files.length === 0) {
    log(WORKER, 'info', 'No inbox items to write');
    return [];
  }

  const logEntries = [];
  const drafts     = [];

  for (const file of files) {
    const filePath = join(inboxDir, file);
    const facts    = readJSON(filePath);

    log(WORKER, 'info', `Writing: ${facts.item?.title?.slice(0, 60)}`);

    let drafted;
    try {
      drafted = await callJSON({
        model:     MODELS.opus,
        system:    SYSTEM,
        user:      USER_TEMPLATE(facts),
        maxTokens: 4000
      });
    } catch (err) {
      log(WORKER, 'error', `Writing failed for ${file}: ${err.message}`);
      logEntries.push({ file, status: 'error', error: err.message });
      continue;
    }

    const fm   = buildFrontmatter(facts, drafted);
    const slug = `${facts.item?.event_date || today()}-${slugify(fm.title)}`;
    const md   = buildArticle(fm, drafted.body || '');

    const outFile = join(draftedDir, `${slug}.md`);
    writeText(outFile, md);
    log(WORKER, 'ok', `Drafted → ${outFile}`);

    drafts.push({ slug, file: outFile, title: fm.title });
    logEntries.push({ file, status: 'drafted', slug, title: fm.title });

    // Consume the inbox item
    advanceFile(filePath, 'logs');
  }

  log(WORKER, 'ok', `Writer complete — ${drafts.length} article(s) drafted`);
  writeLog(WORKER, logEntries);
  return drafts;
}

// Run standalone
if (process.argv[1]?.endsWith('writer.mjs')) {
  runWriter().catch((err) => {
    log(WORKER, 'error', err.message);
    process.exit(1);
  });
}
