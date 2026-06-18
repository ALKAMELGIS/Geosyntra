import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  auditRequiredProductionEnv,
  isProductionDeployment,
  resolveEnvFromGroup,
} from '../server/bootstrapEnv.js'

describe('bootstrapEnv', () => {
  it('isProductionDeployment respects NODE_ENV and GEOSYNTRA_ENV', () => {
    const prevNode = process.env.NODE_ENV
    const prevGeo = process.env.GEOSYNTRA_ENV
    try {
      delete process.env.NODE_ENV
      delete process.env.GEOSYNTRA_ENV
      assert.equal(isProductionDeployment(), false)
      process.env.NODE_ENV = 'production'
      assert.equal(isProductionDeployment(), true)
      process.env.NODE_ENV = 'development'
      process.env.GEOSYNTRA_ENV = 'production'
      assert.equal(isProductionDeployment(), true)
    } finally {
      if (prevNode === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = prevNode
      if (prevGeo === undefined) delete process.env.GEOSYNTRA_ENV
      else process.env.GEOSYNTRA_ENV = prevGeo
    }
  })

  it('resolveEnvFromGroup accepts aliases', () => {
    const prev = process.env.MAPBOX
    try {
      delete process.env.MAPBOX_TOKEN
      delete process.env.MAPBOX_ACCESS_TOKEN
      process.env.MAPBOX = 'pk.test'
      assert.equal(resolveEnvFromGroup(['MAPBOX', 'MAPBOX_TOKEN', 'MAPBOX_ACCESS_TOKEN']), 'MAPBOX')
    } finally {
      if (prev === undefined) delete process.env.MAPBOX
      else process.env.MAPBOX = prev
    }
  })

  it('auditRequiredProductionEnv lists missing canonical keys', () => {
    const saved = {
      MAPBOX: process.env.MAPBOX,
      MAPBOX_TOKEN: process.env.MAPBOX_TOKEN,
      MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY,
      OPENAI: process.env.OPENAI,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    }
    try {
      for (const k of Object.keys(saved)) delete process.env[k]
      const { missing } = auditRequiredProductionEnv()
      assert.deepEqual(missing, ['GEMINI_API_KEY', 'OPENAI'])
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  })
})
