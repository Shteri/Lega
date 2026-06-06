/**
 * BUILDER — Chief of Deploy
 *
 * What it does:  Moves validated articles from pipeline/validated/ into
 *                src/articles/, then runs the site build (npm run build →
 *                Eleventy → _site/).
 *
 * Input:         pipeline/validated/[slug].md
 * Output:        src/articles/[slug].md  +  built site in _site/
 * Model:         Haiku-tier (runs a script — no AI call needed)
 * Trigger:       New file in pipeline/validated/ OR manual "deploy"
 */

import { execSync } from 'child_process';
import { readdirSync, readFileSync, renameSync } from 'fs';
import { join, basename } from 'path';
import {
  ROOT, ARTICLES, stage, parseFrontmatter, ensureDir, log, writeLog
} from '../shared/utils.mjs';

const WORKER = 'builder';

export async function runBuilder() {
  log(WORKER, 'info', 'Starting build');

  const validatedDir = stage('validated');
  ensureDir(ARTICLES);

  let files;
  try {
    files = readdirSync(validatedDir).filter(f => f.endsWith('.md'));
  } catch {
    log(WORKER, 'info', 'pipeline/validated/ is empty — nothing to build');
    return { moved: [], built: false };
  }
  if (files.length === 0) {
    log(WORKER, 'info', 'No validated articles to publish');
    return { moved: [], built: false };
  }

  // Move each validated article into src/articles/
  const moved = [];
  for (const file of files) {
    const src = join(validatedDir, file);
    const slug = basename(file, '.md');
    let title = slug;
    try { title = parseFrontmatter(readFileSync(src, 'utf8')).data.title || slug; } catch { /* keep slug */ }

    renameSync(src, join(ARTICLES, file));
    moved.push({ slug, title });
    log(WORKER, 'ok', `Moved → src/articles/${file}`);
  }

  // Build the site
  log(WORKER, 'info', 'Running npm run build');
  try {
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
  } catch (err) {
    log(WORKER, 'error', `Build failed: ${err.message}`);
    writeLog(WORKER, [{ moved: moved.map(m => m.slug), built: false, error: err.message }]);
    throw err;
  }

  log(WORKER, 'ok', `Build complete — ${moved.length} article(s) published to src/articles/`);
  writeLog(WORKER, [{ moved: moved.map(m => m.slug), built: true }]);
  return { moved, built: true };
}

// Run standalone
if (process.argv[1]?.endsWith('builder.mjs')) {
  runBuilder().catch(err => {
    log(WORKER, 'error', err.message);
    process.exit(1);
  });
}
