/**
 * GitHub Pages only serves `404.html` for unknown routes. SPA shell lives in `Geosyntra.html`;
 * `404.html` must be a hard link (preferred) or symlink to avoid duplicating the same HTML bytes.
 */
import fs from 'node:fs'
import path from 'node:path'

/**
 * @param {string} dir Directory containing Geosyntra.html (e.g. frontend/dist or repo root)
 */
export function link404ToGeosyntra(dir) {
  const indexShell = path.join(dir, 'index.html')
  const geoShell = path.join(dir, 'Geosyntra.html')
  const shellName = fs.existsSync(indexShell) ? 'index.html' : fs.existsSync(geoShell) ? 'Geosyntra.html' : null
  if (!shellName) {
    throw new Error(`link404ToGeosyntra: missing index.html or Geosyntra.html in ${dir}`)
  }
  const geo = path.join(dir, shellName)
  const nf = path.join(dir, '404.html')
  try {
    if (fs.existsSync(nf)) {
      const stGeo = fs.statSync(geo)
      let same = false
      try {
        const stNf = fs.statSync(nf)
        same = stGeo.ino === stNf.ino && stGeo.dev === stNf.dev
      } catch {
        same = false
      }
      if (same) return
      fs.rmSync(nf)
    }
    fs.linkSync(geo, nf)
  } catch (e1) {
    try {
      if (fs.existsSync(nf)) fs.rmSync(nf)
      fs.symlinkSync(shellName, nf, 'file')
    } catch (e2) {
      throw new Error(`404.html → Geosyntra.html alias failed: ${e2?.message || e2} (hardlink: ${e1?.message || e1})`)
    }
  }
}
