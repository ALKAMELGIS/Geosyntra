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
  const geo = path.join(dir, 'Geosyntra.html')
  const nf = path.join(dir, '404.html')
  if (!fs.existsSync(geo)) {
    throw new Error(`link404ToGeosyntra: missing Geosyntra.html in ${dir}`)
  }
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
      fs.symlinkSync('Geosyntra.html', nf, 'file')
    } catch (e2) {
      throw new Error(`404.html → Geosyntra.html alias failed: ${e2?.message || e2} (hardlink: ${e1?.message || e1})`)
    }
  }
}
