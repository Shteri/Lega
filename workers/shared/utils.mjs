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
