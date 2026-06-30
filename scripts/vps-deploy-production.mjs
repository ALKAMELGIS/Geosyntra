#!/usr/bin/env node
/**
 * Deploy main-branch production stack: React (www) + Express (api) to NixOS VPS.
 * Checkout `main` first if you want the latest React/Express (not feature/axum-migration).
 *
 *   npm run vps:deploy:production
 *   npm run vps:deploy:production -- --env-only
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

console.log('==> GeoSyntra production deploy (React www + Express api)');
console.log('    Tip: git checkout main && git pull for latest UI/API code\n');

execFileSync('node', ['scripts/vps-deploy-react.mjs', ...args.filter((a) => a !== '--env-only' && a !== '--no-install')], {
  cwd: root,
  stdio: 'inherit',
});

execFileSync('node', ['scripts/vps-deploy.mjs', ...args], {
  cwd: root,
  stdio: 'inherit',
});

console.log('\nProduction URLs:');
console.log('  https://www.geosyntra.org');
console.log('  https://api.geosyntra.org');
