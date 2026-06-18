import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMigrationConfig, loadEnvFile, REPO_ROOT } from '../../config/migration.config.js'

describe('migration.config', () => {
  it('defaults to dry-run and sqlite dialect', () => {
    const cfg = loadMigrationConfig({ argv: ['--dry-run'], secretsPath: '/nonexistent/secrets.env' })
    assert.equal(cfg.migration.mode, 'dry-run')
    assert.equal(cfg.local.dialect, 'sqlite')
    assert.equal(cfg.migration.strategy, 'incremental')
    assert.ok(cfg.tables.blocklist.includes('schema_migrations'))
  })

  it('parses hostinger.secrets.env.example', () => {
    const env = loadEnvFile(path.join(REPO_ROOT, 'hostinger.secrets.env.example'))
    assert.ok(env.DB_MIGRATION_MODE || env.DB_LOCAL_DIALECT)
  })
})
