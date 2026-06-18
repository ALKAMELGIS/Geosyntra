import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createAuthDirectoryStore } from '../server/authDirectoryStore.js'
import {
  DEV_DEFAULT_OWNER_PASSWORD,
  resolveDevBootstrapOwnerPassword,
  tryDevSystemOwnerFirstLogin,
} from '../server/rbac/devOwnerBootstrap.js'

function tempAuthStore() {
  const jsonFilePath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'geosyntra-auth-')),
    'auth-directory.json',
  )
  return createAuthDirectoryStore({ jsonFilePath })
}

describe('devOwnerBootstrap', () => {
  it('resolveDevBootstrapOwnerPassword uses dev default when env unset', () => {
    const prev = process.env.RBAC_BOOTSTRAP_PASSWORD
    const prevOwner = process.env.GEOSYNTRA_OWNER_PASSWORD
    const prevNode = process.env.NODE_ENV
    const prevGeo = process.env.GEOSYNTRA_ENV
    delete process.env.RBAC_BOOTSTRAP_PASSWORD
    delete process.env.GEOSYNTRA_OWNER_PASSWORD
    process.env.NODE_ENV = 'development'
    delete process.env.GEOSYNTRA_ENV
    try {
      assert.equal(resolveDevBootstrapOwnerPassword(), DEV_DEFAULT_OWNER_PASSWORD)
    } finally {
      if (prev !== undefined) process.env.RBAC_BOOTSTRAP_PASSWORD = prev
      else delete process.env.RBAC_BOOTSTRAP_PASSWORD
      if (prevOwner !== undefined) process.env.GEOSYNTRA_OWNER_PASSWORD = prevOwner
      else delete process.env.GEOSYNTRA_OWNER_PASSWORD
      if (prevNode === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = prevNode
      if (prevGeo === undefined) delete process.env.GEOSYNTRA_ENV
      else process.env.GEOSYNTRA_ENV = prevGeo
    }
  })

  it('tryDevSystemOwnerFirstLogin provisions admin on first sign-in', async () => {
    const store = await tempAuthStore()
    const login = await tryDevSystemOwnerFirstLogin(store, 'admin@Geosyntra.com', 'P@ssw0rd_gis')
    assert.equal(login?.ok, true)
    assert.equal(login?.publicUser?.email, 'admin@geosyntra.com')
    const retry = await Promise.resolve(store.loginUser('admin@Geosyntra.com', 'P@ssw0rd_gis'))
    assert.equal(retry.ok, true)
  })
})
