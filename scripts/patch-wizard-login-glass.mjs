import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'frontend/src/pages/home/onboarding/steps/WizardWelcomeStep.tsx');
const nl = '\r\n';
let s = fs.readFileSync(file, 'utf8');
if (!s.includes('\r\n')) {
  s = s.replace(/\n/g, '\r\n');
}

const anchor = `const RESEND_SECONDS = 60`;
const insert = `const SUPPORT_EMAIL = String(import.meta.env.VITE_SUPPORT_EMAIL || 'support@geosyntra.com').trim()

const RESEND_SECONDS = 60`;

if (!s.includes('VITE_SUPPORT_EMAIL') && s.includes(anchor)) {
  s = s.replace(anchor, insert);
}

const handlerAnchor = `  const onKeepSignedInChange = (next: boolean) => {`;
const handlerInsert = `  const onForgotUsername = () => {
    setError('')
    setInfo('Your GeoSyntra username is the email address you registered with. Enter it above to sign in.')
  }

  const onForgotPassword = () => {
    setError('')
    const em = normalizeEmailInput(email)
    if (!em) {
      setInfo('Enter your email above, then choose Forgot password? to open a recovery request.')
      return
    }
    const subject = encodeURIComponent('GeoSyntra password reset request')
    const body = encodeURIComponent(
      \`Hello GeoSyntra support,\\n\\nI need help resetting my password.\\n\\nAccount email: \${em}\\n\\nThank you.\`,
    )
    window.location.href = \`mailto:\${SUPPORT_EMAIL}?subject=\${subject}&body=\${body}\`
  }

  const onKeepSignedInChange = (next: boolean) => {`;

if (!s.includes('onForgotUsername') && s.includes(handlerAnchor)) {
  s = s.replace(handlerAnchor, handlerInsert);
}

const oldFormStart = `              <form${nl}                className="home-wizard-form"`;
const newFormStart = `              <div className="home-wizard-glass-card">${nl}              <form${nl}                className="home-wizard-form home-wizard-form--glass"`;

if (s.includes(oldFormStart) && !s.includes('home-wizard-glass-card')) {
  s = s.replace(oldFormStart, newFormStart);
}

const oldFormEnd = `              </form>${nl}            </motion.div>`;
const newFormEnd = `              </form>${nl}              </motion.div>${nl}            </motion.div>`;

// fix: use div not motion
const oldFormEndDiv = `              </form>${nl}            </div>`;
const newFormEndDiv = `              </form>${nl}              </motion.div>${nl}            </motion.div>`;

// Read actual ending from file
const formEndMatch = s.match(/              <\/form>\r?\n            <\/(\w+)>/);
if (formEndMatch && !s.includes('home-wizard-glass-card')) {
  /* already partially patched */
}

fs.writeFileSync(file, s);
console.log('partial patch - manual form body still needed');
