// Fails the build if any brand name, the old airport, the old price, or a real
// payment/ID provider shows up in what participants can see.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['public/screens', 'src', 'config'];
const BANNED = [
  [/jeinus|jenius/i, 'brand name'],
  [/\bSFO\b/, 'old airport (SFO)'],
  // "$40–$50" and "$50–$60" are legitimate survey price ranges; only bare "$50" is the old price.
  [/(?<!–)\$50(?![0-9–])/, 'old price ($50)'],
  [/\bStripe\b/, 'payment/ID provider (Stripe)'],
  [/\bSquare\b|\bSQUARE\b/, 'payment provider (Square)'],
  [/McDonnell|San Francisco/, 'old lot address'],
];
// The airport list legitimately includes San Francisco and SFO as a destination.
const ALLOW = new Set(['config/questions.ts']);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(html|tsx?|mjs|css|json)$/.test(name)) yield p;
  }
}

const problems = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (ALLOW.has(file.replace(/\\/g, '/'))) continue;
    const text = readFileSync(file, 'utf8');
    for (const [re, what] of BANNED) {
      const m = text.match(re);
      if (m) problems.push(`${file}: ${what} → "${m[0]}"`);
    }
  }
}

if (problems.length) {
  console.error('[check-brand] Participant-facing files still contain banned terms:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('[check-brand] clean');
