import fs from 'node:fs'
import path from 'node:path'

export function createSyncLogger(logDir, runId) {
  fs.mkdirSync(logDir, { recursive: true })
  const logPath = path.join(logDir, `db-sync-${runId}.log`)
  const lines = []

  const write = (level, message, extra) => {
    const ts = new Date().toISOString()
    const payload = extra ? ` ${JSON.stringify(extra)}` : ''
    const line = `[${ts}] [${level}] ${message}${payload}`
    lines.push(line)
    const out = level === 'ERROR' ? console.error : console.log
    out(line)
  }

  return {
    logPath,
    info: (msg, extra) => write('INFO', msg, extra),
    warn: (msg, extra) => write('WARN', msg, extra),
    error: (msg, extra) => write('ERROR', msg, extra),
    debug: (msg, extra) => write('DEBUG', msg, extra),
    flush() {
      fs.writeFileSync(logPath, `${lines.join('\n')}\n`, 'utf8')
    },
  }
}
