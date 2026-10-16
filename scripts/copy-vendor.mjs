// Copies the rrweb browser builds into public/vendor so screens and the admin
// replay player can load them without a CDN.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
const out = 'public/vendor';
mkdirSync(out, { recursive: true });
const files = [
  ['node_modules/rrweb/dist/rrweb.umd.min.cjs', 'rrweb.min.js'],
  ['node_modules/rrweb-player/dist/rrweb-player.umd.cjs', 'rrweb-player.js'],
  ['node_modules/rrweb-player/dist/style.css', 'rrweb-player.css'],
];
for (const [src, dest] of files) {
  if (existsSync(src)) copyFileSync(src, `${out}/${dest}`);
  else console.warn(`[copy-vendor] missing ${src}`);
}
