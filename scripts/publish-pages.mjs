import { mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const run = (args, cwd = process.cwd()) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const origin = run(['remote', 'get-url', 'origin']);
const sha = run(['rev-parse', 'HEAD']);
if (run(['status', '--porcelain'])) throw new Error('Commit source and tests before publishing.');
const dir = await mkdtemp(join(tmpdir(), 'mukmuk-pages-'));
try {
  const exists = run(['ls-remote', '--heads', 'origin', 'gh-pages']);
  if (exists) {
    run(['clone', '--depth', '1', '--branch', 'gh-pages', origin, dir]);
    run(['rm', '-r', '--ignore-unmatch', '.'], dir);
  } else {
    run(['init', '--initial-branch=gh-pages', dir]); run(['remote', 'add', 'origin', origin], dir);
  }
  await cp(resolve('dist'), dir, { recursive: true });
  await writeFile(join(dir, '.nojekyll'), '');
  await writeFile(join(dir, 'release.json'), JSON.stringify({ sourceCommit: sha, publishedAt: new Date().toISOString() }) + '\n');
  run(['config', 'user.name', run(['config', 'user.name']) || 'github-actions[bot]'], dir);
  run(['config', 'user.email', run(['config', 'user.email']) || '41898282+github-actions[bot]@users.noreply.github.com'], dir);
  run(['add', '.'], dir); run(['commit', '-m', `deploy: mukmuk ${sha.slice(0, 7)}`], dir);
  run(['push', 'origin', 'HEAD:gh-pages'], dir);
  console.log(`Published static build from ${sha.slice(0, 7)} to gh-pages.`);
} finally { await rm(dir, { recursive: true, force: true }); }
