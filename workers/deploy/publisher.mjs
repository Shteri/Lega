/**
 * PUBLISHER — Chief of Deploy
 *
 * What it does:  Commits the built source (new articles + regenerated data) and
 *                pushes to the remote, which triggers Netlify's auto-deploy.
 *
 * Input:         The working tree after Builder (src/articles/, data/)
 * Output:        A pushed commit → Netlify build
 * Model:         Haiku-tier (runs git commands — no AI call needed)
 * Trigger:       After Builder succeeds
 *
 * Note: Netlify auto-deploys from the connected branch on push. SITE_URL (in
 *       .env) is what the Verifier checks once the deploy lands.
 */

import { execFileSync } from 'child_process';
import { ROOT, log, writeLog } from '../shared/utils.mjs';

const WORKER = 'publisher';

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts });
}

export async function runPublisher({ moved = [] } = {}) {
  log(WORKER, 'info', 'Starting publish');

  // Anything to commit?
  const status = git(['status', '--porcelain']).trim();
  if (!status) {
    log(WORKER, 'info', 'Working tree clean — nothing to publish');
    return { committed: false, pushed: false };
  }

  const titles = moved.map(m => m.title || m.slug).filter(Boolean);
  const message = moved.length
    ? `Publish ${moved.length} article(s): ${titles.join('; ')}`.slice(0, 200)
    : `Publish site update (${new Date().toISOString().slice(0, 10)})`;

  try {
    git(['add', '-A']);
    git(['commit', '-m', message]);
    log(WORKER, 'ok', `Committed: ${message}`);
  } catch (err) {
    log(WORKER, 'error', `Commit failed: ${err.message}`);
    throw err;
  }

  try {
    git(['push'], { stdio: 'inherit' });
    log(WORKER, 'ok', 'Pushed → Netlify auto-deploy triggered');
  } catch (err) {
    log(WORKER, 'error', `Push failed: ${err.message}`);
    throw err;
  }

  writeLog(WORKER, [{ committed: true, pushed: true, message, articles: moved.map(m => m.slug) }]);
  return { committed: true, pushed: true, message };
}

// Run standalone
if (process.argv[1]?.endsWith('publisher.mjs')) {
  runPublisher().catch(err => {
    log(WORKER, 'error', err.message);
    process.exit(1);
  });
}
