/**
 * Build Bioicons pack manifests from a local clone of
 * https://github.com/duerrsimon/bioicons
 *
 * Usage:
 *   git clone --depth 1 https://github.com/duerrsimon/bioicons.git /tmp/bioicons
 *   node scripts/build-bioicons-manifest.mjs /tmp/bioicons
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] || '/tmp/bioicons-probe';
const iconsRoot = path.join(root, 'static/icons');
const iconsJson = path.join(iconsRoot, 'icons.json');
const outDir = path.resolve(__dirname, '../public/packs/bioicons');

const CDN = 'https://cdn.jsdelivr.net/gh/duerrsimon/bioicons@master/static/icons';

const LICENSE_LABEL = {
  'cc-0': 'CC0',
  'cc-by-3.0': 'CC BY 3.0',
  'cc-by-4.0': 'CC BY 4.0',
  'cc-by-sa-3.0': 'CC BY-SA 3.0',
  'cc-by-sa-4.0': 'CC BY-SA 4.0',
  mit: 'MIT',
  bsd: 'BSD',
};

const LICENSE_URL = {
  'cc-0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'cc-by-3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'cc-by-4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'cc-by-sa-3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
  'cc-by-sa-4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  mit: 'https://opensource.org/licenses/MIT',
  bsd: 'https://opensource.org/licenses/BSD-3-Clause',
};

if (!fs.existsSync(iconsJson)) {
  console.error('icons.json not found at', iconsJson);
  process.exit(1);
}

const icons = JSON.parse(fs.readFileSync(iconsJson, 'utf8'));
const items = [];
let missing = 0;
const byLicense = {};

for (const icon of icons) {
  const { license: lic, category: cat, author, name } = icon;
  const rel = path.join(lic, cat, author, `${name}.svg`);
  if (!fs.existsSync(path.join(iconsRoot, rel))) {
    missing++;
    continue;
  }
  byLicense[lic] = (byLicense[lic] || 0) + 1;
  items.push({
    id: `bioicons/${lic}/${cat}/${name}`,
    name: String(name).replace(/_/g, ' '),
    category: String(cat).replace(/_/g, ' '),
    categoryKey: cat,
    license: lic,
    licenseLabel: LICENSE_LABEL[lic] || lic,
    licenseUrl: LICENSE_URL[lic] || '',
    author: String(author).replace(/_/g, ' ').replace(/--/g, ' '),
    attributionRequired: lic !== 'cc-0',
    path: `${CDN}/${lic}/${cat}/${author}/${name}.svg`,
    pack: 'bioicons',
    source: 'bioicons',
  });
}

const manifest = {
  version: 1,
  pack: 'bioicons',
  title: 'Bioicons',
  homepage: 'https://bioicons.com/',
  repository: 'https://github.com/duerrsimon/bioicons',
  credit:
    'Icons from Bioicons (https://bioicons.com/), various authors. Each icon retains its original license (CC0, CC BY, CC BY-SA, MIT, BSD). Always check per-icon license before publication.',
  generatedAt: new Date().toISOString(),
  counts: {
    total: items.length,
    missingOnDisk: missing,
    byLicense,
    categories: [...new Set(items.map((i) => i.category))].sort(),
  },
  items,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest));
const cc0Items = items.filter((i) => i.license === 'cc-0');
fs.writeFileSync(
  path.join(outDir, 'manifest-cc0.json'),
  JSON.stringify({
    ...manifest,
    items: cc0Items,
    counts: { total: cc0Items.length, byLicense: { 'cc-0': cc0Items.length } },
  }),
);

console.log(`Wrote ${items.length} icons (${cc0Items.length} CC0) → ${outDir}`);
console.log('Missing on disk:', missing);
console.log(byLicense);
