// build-www.js
// Assembles a clean ./www folder from the repo root for Capacitor.
const fs = require('fs');
const path = require('path');

const OUT = 'www';

const EXCLUDE = new Set([
  'node_modules', 'ios', 'www', 'old', '.git', '.github',
  'build-www.js', 'package.json', 'package-lock.json',
  'capacitor.config.json', '.gitignore', '.capacitorignore',
  'codemagic.yaml', 'README-SHIPPING.md', 'README.md',
]);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let fileCount = 0;
function countFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) countFiles(path.join(dir, e.name));
    else fileCount++;
  }
}

for (const e of fs.readdirSync('.', { withFileTypes: true })) {
  if (EXCLUDE.has(e.name)) continue;
  const src = e.name;
  const dst = path.join(OUT, e.name);
  if (e.isDirectory()) fs.cpSync(src, dst, { recursive: true });
  else fs.copyFileSync(src, dst);
}

countFiles(OUT);
console.log(`www assembled from root (${fileCount} files), excluding build/config files`);