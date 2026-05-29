import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const p = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../frontend/src/pages/home/onboarding/steps/WizardWelcomeStep.tsx',
)

let s = fs.readFileSync(p, 'utf8')

const replacement = `<label className="home-wizard-keep-signed-in" htmlFor="home-wizard-keep-signed-in">
                      <input
                        id="home-wizard-keep-signed-in"
                        type="checkbox"
                        className="home-wizard-keep-signed-in__input"
                        checked={keepSignedIn}
                        onChange={e => onKeepSignedInChange(e.target.checked)}
                        disabled={busy}
                      />
                      <span className="home-wizard-keep-signed-in__label">Keep me signed in</span>
                    </label>`

s = s.replace(/<GlassToggle[\s\S]*?\/>/, replacement)

if (s.includes('GlassToggle')) {
  console.error('GlassToggle still present')
  process.exit(1)
}

fs.writeFileSync(p, s)
console.log('patched', p)
