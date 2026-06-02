import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveTokenEnvValue } from '../server/env.js'

describe('env.js Hostinger aliases', () => {
  it('resolves MAPBOX from hPanel short name', () => {
    const prev = process.env.MAPBOX
    try {
      delete process.env.MAPBOX_TOKEN
      delete process.env.MAPBOX_ACCESS_TOKEN
      process.env.MAPBOX = 'pk.hostinger-alias'
      assert.equal(resolveTokenEnvValue('mapbox'), 'pk.hostinger-alias')
    } finally {
      if (prev === undefined) delete process.env.MAPBOX
      else process.env.MAPBOX = prev
    }
  })

  it('resolves DEEPSEEK from hPanel short name', () => {
    const prev = process.env.DEEPSEEK
    try {
      delete process.env.DEEPSEEK_API_KEY
      process.env.DEEPSEEK = 'ds-test-key'
      assert.equal(resolveTokenEnvValue('deepseek'), 'ds-test-key')
    } finally {
      if (prev === undefined) delete process.env.DEEPSEEK
      else process.env.DEEPSEEK = prev
    }
  })

  it('resolves OPENROUTESERVICE from hPanel short name', () => {
    const prev = process.env.OPENROUTESERVICE
    try {
      delete process.env.OPENROUTESERVICE_API_KEY
      process.env.OPENROUTESERVICE = 'ors-test-key'
      assert.equal(resolveTokenEnvValue('openrouteservice'), 'ors-test-key')
    } finally {
      if (prev === undefined) delete process.env.OPENROUTESERVICE
      else process.env.OPENROUTESERVICE = prev
    }
  })
})
