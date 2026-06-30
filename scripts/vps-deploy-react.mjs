#!/usr/bin/env node
/**
 * Build React (frontend/) and rsync to NixOS www root on the VPS.
 * Use from main branch for production React code.
 *
 *   npm run vps:deploy:react
 *   npm run vps:deploy:react -- --skip-build
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { connectSsh2, repoRoot, sshRsyncArgs, vpsConfig } from './lib/vps-ssh.mjs';

const args = process.argv.slice(2);
const SKIP_BUILD = args.includes('--skip-build');
const WEB_ROOT = process.env.GEOSYNTRA_REACT_WEB_ROOT || '/var/www/geosyntra-react';
const API_BASE = process.env.VITE_API_BASE_URL || 'https://api.geosyntra.org';
const BASE_PATH = process.env.VITE_BASE_PATH || '/';
const PUBLIC_URL = process.env.VITE_PRODUCTION_PUBLIC_URL || 'https://www.geosyntra.org/';
const OAUTH_RETURN = process.env.VITE_AUTH_GOOGLE_REDIRECT_URI
  || `${PUBLIC_URL.replace(/\/+$/, '')}/oauth-return.html`;

const frontendDir = path.join(repoRoot, 'frontend');
const distDir = path.join(frontendDir, 'dist');

async function execRemote(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, { pty: false }, (err, stream) => {
      if (err) return reject(err);
      let code = 0;
      stream
        .on('close', (c) => resolve(c ?? code))
        .on('exit', (c) => { code = c ?? 0; })
        .on('data', (d) => process.stdout.write(d))
        .stderr.on('data', (d) => process.stderr.write(d));
    });
  });
}

async function main() {
  const { host } = vpsConfig();
  console.log(`Deploy React → ${host}:${WEB_ROOT}`);

  if (!SKIP_BUILD) {
    console.log(`Building frontend (VITE_API_BASE_URL=${API_BASE}, VITE_BASE_PATH=${BASE_PATH})…`);
    execFileSync('npm', ['run', 'build', '-w', 'frontend'], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        SKIP_GEOSYNTRA_SETUP: '1',
        VITE_API_BASE_URL: API_BASE,
        VITE_BASE_PATH: BASE_PATH,
        VITE_PRODUCTION_PUBLIC_URL: PUBLIC_URL,
        VITE_AUTH_GOOGLE_REDIRECT_URI: OAUTH_RETURN,
        VITE_AUTH_LINKEDIN_REDIRECT_URI: process.env.VITE_AUTH_LINKEDIN_REDIRECT_URI || OAUTH_RETURN,
        VITE_AUTH_GITHUB_REDIRECT_URI: process.env.VITE_AUTH_GITHUB_REDIRECT_URI || OAUTH_RETURN,
      },
    });
  }

  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    console.error('frontend/dist/index.html missing — run npm run build -w frontend');
    process.exit(2);
  }

  const { target, sshCmd } = sshRsyncArgs();
  console.log('Uploading static files…');
  execFileSync(
    'rsync',
    ['-avz', '--delete', '-e', sshCmd, `${distDir}/`, `${target}:${WEB_ROOT}/`],
    { stdio: 'inherit' },
  );

  const { conn } = await connectSsh2();
  try {
    await execRemote(conn, `chmod -R a+rX ${WEB_ROOT} && ls -la ${WEB_ROOT}/index.html`);
    console.log('\n✅ React static deployed — https://www.geosyntra.org');
  } finally {
    conn.end();
  }
}

main().catch((e) => {
  console.error('Deploy error:', e.message);
  process.exit(1);
});
