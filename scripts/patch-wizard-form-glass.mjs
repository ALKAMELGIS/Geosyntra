import fs from 'node:fs';
import path from 'node:path';

const tsx = path.join(process.cwd(), 'frontend/src/pages/home/onboarding/steps/WizardWelcomeStep.tsx');
const frag = path.join(process.cwd(), 'scripts/wizard-form-glass-fragment.txt');

let s = fs.readFileSync(tsx, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';
let newBlock = fs.readFileSync(frag, 'utf8');
if (nl === '\r\n') newBlock = newBlock.replace(/\n/g, '\r\n');

const start = `              <form${nl}                className="home-wizard-form"`;
const end = `              </form>${nl}            </motion.div>`;

const startAlt = `              <form${nl}                className="home-wizard-form"${nl}`;
const i0 = s.indexOf(start);
const i1 = s.indexOf(end);
if (i0 === -1 || i1 === -1) {
  console.error('markers not found', { i0, i1 });
  process.exit(1);
}

const before = s.slice(0, i0);
const after = s.slice(i1 + end.length);
s = before + newBlock + after;
fs.writeFileSync(tsx, s, 'utf8');
console.log('replaced form block');
