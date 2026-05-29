/**
 * One-off raster favicons from public/favicon.svg (requires: npx -p sharp node scripts/render-favicon-png.mjs).
 */
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pub = path.join(__dirname, '../public')
const svgPath = path.join(pub, 'favicon.svg')
const repoRoot = path.join(__dirname, '../..')

if (!fs.existsSync(svgPath)) {
  console.error('Missing', svgPath)
  process.exit(1)
}

const buf = await sharp(svgPath).png().toBuffer()

await sharp(buf).resize(32, 32).png().toFile(path.join(pub, 'favicon-32x32.png'))
await sharp(buf).resize(16, 16).png().toFile(path.join(pub, 'favicon-16x16.png'))
await fs.promises.copyFile(path.join(pub, 'favicon-32x32.png'), path.join(pub, 'favicon.png'))
await fs.promises.copyFile(path.join(pub, 'favicon-32x32.png'), path.join(repoRoot, 'favicon.png'))
await fs.promises.copyFile(path.join(pub, 'favicon-32x32.png'), path.join(repoRoot, 'favicon-32x32.png'))
await fs.promises.copyFile(path.join(pub, 'favicon-16x16.png'), path.join(repoRoot, 'favicon-16x16.png'))

console.log('Wrote favicon PNGs under frontend/public and repo root')
