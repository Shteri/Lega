import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, renameSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';

// Project root — always relative to this file
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PIPELINE = join(ROOT, 'pipeline');
export const DATA     = join(ROOT, 'data');
export const ARTICLES = join(ROOT, 'src', 'articles');

// Pipeline stage paths
export function stage(name) {
  return join(PIPELINE, name);
}

// Read/write JSON
export function readJSON(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function writeJSON(filePath, data) {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Read all JSON files from a pipeline stage
export function readStage(stageName) {
  const dir = stage(stageName);
  ensureDir(dir);
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ file: join(dir, f), data: readJSON(join(dir, f)) }));
}

// Move a file from one pipeline stage to another
export function advanceFile(filePath, toStageName) {
  const dest = join(stage(toStageName), basename(filePath));
  ensureDir(dirname(dest));
  renameSync(filePath, dest);
  return dest;
}

// Ensure directory exists
export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// Timestamped ID: 2026-06-01T09-00-00
export function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// URL → safe filename slug
export function urlToId(url) {
  return url
    .replace(/https?:\/\//, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase()
    .slice(0, 80);
}

// Structured logger
export function log(worker, level, message) {
  const ts = new Date().toISOString();
  const prefix = { info: '→', warn: '⚠', error: '✗', ok: '✓' }[level] || '·';
  console.log(`[${ts}] [${worker}] ${prefix} ${message}`);
}

// Write a run log to pipeline/logs/
export function writeLog(worker, entries) {
  const logFile = join(stage('logs'), `${worker}-${timestampId()}.json`);
  ensureDir(stage('logs'));
  writeJSON(logFile, {
    worker,
    run_at: new Date().toISOString(),
    entries
  });
}

// Write a UTF-8 text file (e.g. a markdown article)
export function writeText(filePath, text) {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, text, 'utf8');
}

// Today's date as YYYY-MM-DD
export function today() {
  return new Date().toISOString().slice(0, 10);
}

// Title → kebab-case slug suitable for a filename
export function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '');
}

// Serialize a frontmatter object → YAML lines (no --- delimiters).
// Targets the article-schema.md field set; emits valid, stable YAML.
export function serializeFrontmatter(fm) {
  const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const lines = [];

  lines.push(`title: ${q(fm.title)}`);
  lines.push(`layout: ${fm.layout || 'article.njk'}`);
  lines.push(`sector: ${fm.sector}`);
  lines.push(`content_type: ${fm.content_type}`);
  lines.push(`jurisdiction: ${fm.jurisdiction}`);
  lines.push(`event_date: ${q(fm.event_date)}`);
  lines.push(`pub_date: ${q(fm.pub_date)}`);
  lines.push(`regulator: ${fm.regulator}`);
  if (fm.law_slug) lines.push(`law_slug: ${fm.law_slug}`);

  if (fm.tags?.length) {
    lines.push('tags:');
    for (const t of fm.tags) lines.push(`  - ${t}`);
  }

  lines.push(`backfill_needed: ${fm.backfill_needed ? 'true' : 'false'}`);
  lines.push(`is_update: ${fm.is_update ? 'true' : 'false'}`);

  if (fm.primary_sources?.length) {
    lines.push('primary_sources:');
    for (const s of fm.primary_sources) {
      lines.push(`  - label: ${q(s.label)}`);
      lines.push(`    url: ${q(s.url)}`);
    }
  }

  return lines.join('\n');
}

// Build a full markdown article string from a frontmatter object + body.
export function buildArticle(fm, body) {
  return `---\n${serializeFrontmatter(fm)}\n---\n\n${body.trim()}\n`;
}

// Parse a markdown article → { data, body }.
// Mini-parser tuned to the frontmatter shape this pipeline produces.
export function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: md };

  const lines = m[1].split('\n');
  const body  = m[2].replace(/^\n+/, '');
  const data  = {};
  const unq   = (s) => s.trim().replace(/^["']|["']$/g, '').replace(/\\"/g, '"');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) { i++; continue; }

    const key = kv[1];
    const val = kv[2];

    if (val !== '') {
      let v = unq(val);
      if (v === 'true') v = true;
      else if (v === 'false') v = false;
      data[key] = v;
      i++;
      continue;
    }

    // Empty value → block list (scalars) or block list of maps
    let j = i + 1;
    if (lines[j] && /^\s+-\s+\w+:/.test(lines[j])) {
      const items = [];
      let cur = null;
      while (j < lines.length && /^\s+/.test(lines[j])) {
        const mapStart = lines[j].match(/^\s+-\s+(\w+):\s*(.*)$/);
        const mapCont  = lines[j].match(/^\s+(\w+):\s*(.*)$/);
        if (mapStart) {
          if (cur) items.push(cur);
          cur = { [mapStart[1]]: unq(mapStart[2]) };
        } else if (mapCont && cur) {
          cur[mapCont[1]] = unq(mapCont[2]);
        } else break;
        j++;
      }
      if (cur) items.push(cur);
      data[key] = items;
    } else if (lines[j] && /^\s+-\s+/.test(lines[j])) {
      const items = [];
      while (j < lines.length && /^\s+-\s+/.test(lines[j])) {
        items.push(unq(lines[j].replace(/^\s+-\s+/, '')));
        j++;
      }
      data[key] = items;
    } else {
      data[key] = '';
    }
    i = j;
  }

  return { data, body };
}
