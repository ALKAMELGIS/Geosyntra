#!/usr/bin/env node
/**
 * Check geosyntra.org DNS against GitHub Pages requirements.
 * Usage: node scripts/verify-dns-geosyntra.mjs
 */
import { promises as dns } from 'dns'

const GITHUB_A = new Set([
  '185.199.108.153',
  '185.199.109.153',
  '185.199.110.153',
  '185.199.111.153',
])
const WWW_CNAME_TARGET = 'alkamelgis.github.io'

async function resolve4(host) {
  try {
    return await dns.resolve4(host)
  } catch {
    return []
  }
}

async function resolveCname(host) {
  try {
    return await dns.resolveCname(host)
  } catch {
    return []
  }
}

function fail(msg) {
  console.log('  FAIL:', msg)
}
function ok(msg) {
  console.log('  OK:  ', msg)
}
function warn(msg) {
  console.log('  WARN:', msg)
}

console.log('\n=== GeoSyntra DNS check (GitHub Pages) ===\n')

const wwwCnames = await resolveCname('www.geosyntra.org')
if (!wwwCnames.length) {
  fail('www.geosyntra.org has no CNAME')
} else {
  const target = wwwCnames[0].toLowerCase()
  if (target === WWW_CNAME_TARGET || target.endsWith('.github.io')) {
    ok(`www → ${wwwCnames[0]}`)
  } else {
    fail(`www CNAME is "${wwwCnames[0]}" — must be "${WWW_CNAME_TARGET}" (not .github.ae)`)
  }
}

const apexIps = await resolve4('geosyntra.org')
if (!apexIps.length) {
  fail('geosyntra.org has no A records')
} else {
  const bad = apexIps.filter(ip => !GITHUB_A.has(ip))
  const good = apexIps.filter(ip => GITHUB_A.has(ip))
  if (bad.length) {
    fail(`apex has non-GitHub IPs: ${bad.join(', ')} — delete these in Hostinger (e.g. 46.202.183.152)`)
  }
  if (good.length >= 1) {
    ok(`apex GitHub A records: ${good.join(', ')}`)
  }
  if (good.length < 4) {
    warn(`apex should have all 4 GitHub A records; found ${good.length}`)
  }
}

const apiIps = await resolve4('api.geosyntra.org')
if (apiIps.length) ok(`api → ${apiIps.join(', ')} (Hostinger API — separate from Pages)`)

console.log('\nHostinger fixes:')
console.log('  1. Delete CNAME www → ALKAMELGIS.github.ae')
console.log('  2. Add    CNAME www → alkamelgis.github.io')
console.log('  3. Delete A     @  → 46.202.183.152')
console.log('  4. GitHub → Pages → Check again → Enforce HTTPS')
console.log('  5. Open https://www.geosyntra.org/#/\n')
