import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sheetPath = path.join(root, 'frontend/src/pages/home/profile/HomeProfileSheet.tsx')
const hero = fs.readFileSync(path.join(root, 'scripts/hero-fragment.txt'), 'utf8')
let text = fs.readFileSync(sheetPath, 'utf8')

const BAD = '          <motionless />'
if (!text.includes(BAD)) {
  console.error('placeholder not found')
  process.exit(1)
}
text = text.replace(BAD, `${hero.trimEnd()}\n`, 1)
text = text.replace(
  'className="home-profile-sheet__head"',
  'className="home-profile-sheet__head home-profile-sheet__head--hero"',
  1,
)

const duplicateFields = `          <div className="home-profile-field">
            <dt className="home-profile-field__k">Name</dt>
            <dd className="home-profile-field__v">{displayName || '—'}</dd>
          </div>
          <div className="home-profile-field">
            <dt className="home-profile-field__k">Email</dt>
            <dd className="home-profile-field__v home-profile-field__v--muted">{user.email}</dd>
          </div>
`
text = text.replace(duplicateFields, '')

text = text.replace(
  '<section className="home-profile-avatar-card"',
  '<section className="home-profile-avatar-card home-profile-avatar-card--compact"',
)

fs.writeFileSync(sheetPath, text)
console.log('patched profile header')
