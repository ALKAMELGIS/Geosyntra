// VPS SSH helper — runs a remote command (stdin) over ssh2 using creds from hostinger.secrets.env
// Usage:
//   echo "uname -a" | node scripts/vps-ssh.mjs            (command from stdin)
//   node scripts/vps-ssh.mjs "uname -a"                   (command from argv)
//   node scripts/vps-ssh.mjs --put localFile remotePath   (upload a file via sftp)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadEnvFile(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const secrets = loadEnvFile(path.join(root, 'hostinger.secrets.env'));
const HOST = process.env.VPS_HOST || secrets.VPS_HOST;
const PORT = Number(process.env.VPS_SSH_PORT || secrets.VPS_SSH_PORT || 22);
const USER = process.env.VPS_SSH_USER || secrets.VPS_SSH_USER || 'root';
const PASS = process.env.VPS_ROOT_PASS || secrets.VPS_ROOT_PASS;

if (!HOST || !PASS) {
  console.error('Missing VPS_HOST or VPS_ROOT_PASS in hostinger.secrets.env');
  process.exit(2);
}

let ssh2;
try {
  ssh2 = await import('ssh2');
} catch {
  console.error('ssh2 not installed. Run: npm install ssh2 --no-save');
  process.exit(2);
}
const { Client } = ssh2.default || ssh2;

function connect() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on('ready', () => resolve(conn))
      .on('error', reject)
      .connect({ host: HOST, port: PORT, username: USER, password: PASS, readyTimeout: 30000, keepaliveInterval: 10000 });
  });
}

async function runCommand(conn, cmd) {
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

async function putFile(conn, local, remote) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(local, remote, (e) => (e ? reject(e) : resolve(0)));
    });
  });
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) return resolve('');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
  });
}

const args = process.argv.slice(2);
const conn = await connect();
try {
  if (args[0] === '--put') {
    await putFile(conn, args[1], args[2]);
    console.log(`uploaded ${args[1]} -> ${args[2]}`);
    process.exitCode = 0;
  } else {
    let cmd = args.length ? args.join(' ') : await readStdin();
    cmd = cmd.trim();
    if (!cmd) { console.error('No command provided'); process.exitCode = 2; }
    else { process.exitCode = await runCommand(conn, cmd); }
  }
} catch (e) {
  console.error('SSH error:', e.message);
  process.exitCode = 1;
} finally {
  conn.end();
}
