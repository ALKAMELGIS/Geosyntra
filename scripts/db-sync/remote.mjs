import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import os from 'node:os'

/**
 * Pull production SQLite over SSH into a temp file for sync.
 * @param {object} ssh
 * @param {string} localDest
 */
export function pullSqliteOverSsh(ssh, localDest) {
  const { host, port, user, pass, remotePath } = ssh
  if (!host || !user || !remotePath) {
    throw new Error('DB_PROD_SQLITE_SSH_HOST, DB_PROD_SQLITE_SSH_USER, DB_PROD_SQLITE_SSH_REMOTE_PATH required')
  }
  fs.mkdirSync(path.dirname(localDest), { recursive: true })
  if (pass) {
    try {
      const scp = requireScpWithSshpass()
      execFileSync(scp, [
        '-P',
        String(port),
        `${user}@${host}:${remotePath}`,
        localDest,
      ], { stdio: 'inherit', env: { ...process.env, SSHPASS: pass } })
      return localDest
    } catch {
      /* fall through to scp */
    }
  }
  execFileSync(
    'scp',
    ['-P', String(port), `${user}@${host}:${remotePath}`, localDest],
    { stdio: 'inherit' },
  )
  return localDest
}

/**
 * Push synced SQLite back to production (use with extreme caution).
 */
export function pushSqliteOverSsh(ssh, localSource) {
  const { host, port, user, pass, remotePath } = ssh
  if (!host || !user || !remotePath) {
    throw new Error('SSH remote path not configured')
  }
  const remoteBackup = `${remotePath}.pre-sync-${Date.now()}`
  const remoteCmd = `cp ${shellQuote(remotePath)} ${shellQuote(remoteBackup)} 2>/dev/null || true`
  sshExec(ssh, remoteCmd)
  if (pass) {
    execFileSync(
      'sshpass',
      ['-e', 'scp', '-P', String(port), localSource, `${user}@${host}:${remotePath}`],
      { stdio: 'inherit', env: { ...process.env, SSHPASS: pass } },
    )
  } else {
    execFileSync(
      'scp',
      ['-P', String(port), localSource, `${user}@${host}:${remotePath}`],
      { stdio: 'inherit' },
    )
  }
}

function sshExec(ssh, command) {
  const { host, port, user, pass } = ssh
  const args = pass
    ? ['-e', 'ssh', '-p', String(port), `${user}@${host}`, command]
    : ['ssh', '-p', String(port), `${user}@${host}`, command]
  const bin = pass ? 'sshpass' : 'ssh'
  execFileSync(bin, args, {
    stdio: 'inherit',
    env: pass ? { ...process.env, SSHPASS: pass } : process.env,
  })
}

function requireScpWithSshpass() {
  return 'sshpass'
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`
}

export function tempProdSqlitePath(runId) {
  return path.join(os.tmpdir(), `geosyntra-prod-${runId}.db`)
}
