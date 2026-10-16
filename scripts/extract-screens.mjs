// One-time: pull the individual screens out of the bundled design prototype.
//
//   node scripts/extract-screens.mjs [path/to/Jeinus_Prototype.html]
//
// The bundle stores its pages in `var PAGES={...}` inside a JSON-encoded
// <script type="__bundler/template">. We evaluate only that object literal,
// in an empty sandbox, and write each page to screens/raw/.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import vm from 'node:vm';

const src = process.argv[2] || process.env.PROTOTYPE_PATH || 'design/prototype.html';
const bundle = readFileSync(src, 'utf8');

const tpl = bundle.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
if (!tpl) throw new Error('No __bundler/template block found. Is this the bundled prototype?');
const template = JSON.parse(tpl[1]);

const start = template.indexOf('var PAGES=');
const end = template.indexOf('};\n(function(){', start);
if (start < 0 || end < 0) throw new Error('Could not find the PAGES object in the template.');
const literal = template.slice(start + 'var PAGES='.length, end + 1);
const pages = vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 2000 });

mkdirSync('screens/raw', { recursive: true });
let n = 0;
for (const [name, html] of Object.entries(pages)) {
  writeFileSync(`screens/raw/${name}`, html);
  n++;
}
console.log(`[extract] wrote ${n} screens to screens/raw/`);

// Self-host the fonts the bundle embeds (Inter, Instrument Serif) so participants'
// browsers never call a third-party font service.
const manifestBlock = bundle.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/);
if (manifestBlock) {
  const manifest = JSON.parse(manifestBlock[1]);
  const faces = [...template.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]);
  mkdirSync('public/fonts', { recursive: true });
  const css = [];
  let i = 0;
  const written = new Map();
  for (const face of faces) {
    const ref = face.match(/url\("([0-9a-f-]{36})"\)/);
    const asset = ref && manifest[ref[1]];
    if (!asset || !/font/.test(asset.mime)) continue;
    const fam = (face.match(/font-family:\s*'([^']+)'/) || [])[1] || 'font';
    let name = written.get(ref[1]);
    if (!name) {
      name = `${fam.toLowerCase().replace(/\s+/g, '-')}-${i++}.woff2`;
      writeFileSync(`public/fonts/${name}`, Buffer.from(asset.data, 'base64'));
      written.set(ref[1], name);
    }
    css.push(face.replace(/url\("[0-9a-f-]{36}"\)/, `url("/fonts/${name}")`));
  }
  writeFileSync('public/fonts/fonts.css', css.join('\n') + '\n');
  console.log(`[extract] wrote ${css.length} font faces to public/fonts/`);
}
