#!/usr/bin/env node
/**
 * GeoSyntra — automated push with live status messages.
 * Runs quick validate + tests, commits (optional), pushes, then reports GitHub Actions runs.
 *
 * Usage:
 *   node scripts/push.mjs
 *   node scripts/push.mjs --message "feat: my change"
 *   node scripts/push.mjs --no-commit   (push existing commits only)
 */
import { spawnSync } from 'node:child_process';
import { getRepoRoot } from './lib/repoRoot.mjs';

const root = getRepoRoot(import.meta.url);
const args = process.argv.slice(2);
const noCommit = args.includes('--no-commit');
const msgIdx = args.indexOf('--message');
const commitMessage =
  msgIdx >= 0 && args[msgIdx + 1]
    ? args[msgIdx + 1]
    : 'feat(satellite): symbology, elevation contours, and push automation';

const GIT_SAFE = ['-c', `safe.directory=${root}`];

function stamp() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

function log(icon, text) {
  console.log(`[${stamp()}] ${icon}  ${text}`);
}

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, {
    cwd: root,
    stdio: opts.inherit === false ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...opts,
  });
  return r;
}

function git(...gitArgs) {
  return run('git', [...GIT_SAFE, ...gitArgs], { shell: false });
}

function gitOut(...gitArgs) {
  return run('git', [...GIT_SAFE, ...gitArgs], { inherit: false, shell: false });
}

function fail(step, detail) {
  log('✗', `${step} failed${detail ? `: ${detail}` : ''}`);
  process.exit(1);
}

log('▶', 'GeoSyntra push pipeline starting…');
log('ℹ', `Repository: ${root}`);

log('▶', '[1/6] Quick validate (startup checks)…');
const v = run('node', ['scripts/validate-startup.mjs', '--quick']);
if (v.status !== 0) fail('Validate');

log('▶', '[2/6] Unit tests (symbology engine)…');
const t = run('npm', ['run', 'test', '-w', 'frontend', '--', '--run', 'siLayerSymbologyEngine'], { cwd: root });
if (t.status !== 0) fail('Tests');

if (!noCommit) {
  log('▶', '[3/6] Staging changes (excluding local Pages bundles)…');
  git('add', '-A');
  git('reset', 'HEAD', '--', 'assets');
  const diff = gitOut('diff', '--cached', '--quiet');
  if (diff.status === 0) {
    log('ℹ', 'No staged changes — skipping commit.');
  } else {
    log('▶', '[4/6] Creating commit…');
    const c = git('commit', '-m', commitMessage);
    if (c.status !== 0) fail('Commit');
    log('✓', 'Commit created.');
  }
} else {
  log('ℹ', '[3–4/6] Skipped commit (--no-commit).');
}

const branch = gitOut('branch', '--show-current');
const branchName = (branch.stdout || 'main').trim() || 'main';

log('▶', '[5/6] Pull rebase then push to origin…');
const pull = git('pull', '--rebase', 'origin', branchName);
if (pull.status !== 0) fail('Pull rebase');

const push = git('push', '-u', 'origin', branchName);
if (push.status !== 0) fail('Push');

log('✓', `Pushed to origin/${branchName}`);

log('▶', '[6/6] GitHub Actions (deploy / CI)…');
const remote = gitOut('remote', 'get-url', 'origin');
const url = (remote.stdout || '').trim();
const m = url.match(/github\.com[:/](.+?)(?:\.git)?$/i);
if (m) {
  const slug = m[1];
  const api = `https://api.github.com/repos/${slug}/actions/runs?per_page=3&branch=${encodeURIComponent(branchName)}`;
  await (async () => {
    try {
      const res = await fetch(api, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'geosyntra-push-script' },
      });
      if (res.ok) {
        const data = await res.json();
        const runs = data.workflow_runs || [];
        if (runs.length) {
          log('ℹ', 'Recent workflow runs on this branch:');
          for (const run of runs) {
            const status = run.status === 'completed' ? run.conclusion : run.status;
            log('  ', `• ${run.name} — ${status} — ${run.html_url}`);
          }
        } else {
          log('ℹ', 'No recent Actions runs listed yet (may appear in a few seconds).');
        }
      }
      log('ℹ', `Actions: https://github.com/${slug}/actions`);
    } catch {
      log('ℹ', `Actions: https://github.com/${slug}/actions`);
    }
  })();
} else {
  log('ℹ', 'Could not resolve GitHub remote URL for Actions link.');
}

log('✓', 'Push pipeline finished.');
