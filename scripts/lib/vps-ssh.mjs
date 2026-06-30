// Shared VPS SSH helpers — key auth (NixOS) with password fallback (Ubuntu restore).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, '../..');

export function loadEnvFile(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

export function vpsConfig() {
  const secrets = loadEnvFile(path.join(repoRoot, 'hostinger.secrets.env'));
  const host =
    process.env.GEOSYNTRA_DEPLOY_HOST ||
    process.env.VPS_HOST ||
    secrets.GEOSYNTRA_DEPLOY_HOST ||
    secrets.VPS_HOST;
  const port = Number(
    process.env.GEOSYNTRA_DEPLOY_PORT ||
      process.env.VPS_SSH_PORT ||
      secrets.GEOSYNTRA_DEPLOY_PORT ||
      secrets.VPS_SSH_PORT ||
      22,
  );
  const user =
    process.env.GEOSYNTRA_DEPLOY_USER ||
    process.env.VPS_SSH_USER ||
    secrets.GEOSYNTRA_DEPLOY_USER ||
    secrets.VPS_SSH_USER ||
    'root';
  const pass = process.env.VPS_ROOT_PASS || secrets.VPS_ROOT_PASS;
  const keyPath =
    process.env.GEOSYNTRA_VPS_SSH_IDENTITY ||
    path.join(os.homedir(), '.ssh', 'id_ed25519_geosyntra_vps');
  const useKey = fs.existsSync(keyPath);
  return { host, port, user, pass, keyPath, useKey, secrets };
}

export async function connectSsh2() {
  const { host, port, user, pass, keyPath, useKey } = vpsConfig();
  if (!host) throw new Error('Missing GEOSYNTRA_DEPLOY_HOST / VPS_HOST in hostinger.secrets.env');
  if (!useKey && !pass) {
    throw new Error('Need SSH key or VPS_ROOT_PASS in hostinger.secrets.env');
  }

  let ssh2;
  try {
    ssh2 = await import('ssh2');
  } catch {
    throw new Error('ssh2 not installed. Run: npm install ssh2 --no-save');
  }
  const { Client } = ssh2.default || ssh2;

  const opts = {
    host,
    port,
    username: user,
    readyTimeout: 30000,
    keepaliveInterval: 10000,
  };
  if (useKey) {
    opts.privateKey = fs.readFileSync(keyPath);
  } else {
    opts.password = pass;
  }

  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => resolve({ conn, host, port, user })).on('error', reject).connect(opts);
  });
}

export function sshRsyncArgs() {
  const { host, port, user, keyPath, useKey } = vpsConfig();
  const target = `${user}@${host}`;
  const sshCmd = useKey
    ? `ssh -i ${keyPath} -p ${port} -o StrictHostKeyChecking=accept-new`
    : `ssh -p ${port} -o StrictHostKeyChecking=accept-new`;
  return { target, sshCmd, host, port, user };
}
