/**
 * Lightweight scientific SVG templates for MCP generation.
 * All original simple illustrations — pink-friendly defaults.
 */

export const TEMPLATES = {
  cell: { category: 'cell', description: 'Round animal cell with nucleus' },
  nucleus: { category: 'cell', description: 'Nucleus with nucleolus' },
  bacteria: { category: 'cell', description: 'Rod-shaped bacterium' },
  virus: { category: 'cell', description: 'Icosahedral-style virus with spikes' },
  dna: { category: 'dna', description: 'Double helix sketch' },
  protein: { category: 'protein', description: 'Globular protein blob' },
  antibody: { category: 'protein', description: 'Y-shaped antibody' },
  flask: { category: 'lab', description: 'Erlenmeyer flask' },
  pipette: { category: 'lab', description: 'Micropipette with tip' },
  arrow: { category: 'arrows', description: 'Straight process arrow' },
  circle: { category: 'symbols', description: 'Soft circle badge' },
  hexagon: { category: 'symbols', description: 'Hexagon molecule-like badge' },
  star: { category: 'symbols', description: 'Highlight star' },
  label: { category: 'symbols', description: 'Rounded label chip' },
  cas9_dna: {
    category: 'dna',
    description: 'DNA double helix interacting with Cas9 protein (CRISPR-style)',
  },
  lab_setup: {
    category: 'lab',
    description: 'Flask, Eppendorf tube, pipette dosing a blue 96-well plate',
  },
};

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} template
 * @param {{ primary: string, stroke: string, label?: string }} opts
 */
export function buildFromTemplate(template, opts) {
  const p = opts.primary || '#db2777';
  const s = opts.stroke || '#9d174d';
  const light = mix(p, '#ffffff', 0.55);

  switch (template) {
    case 'cell':
      return svgWrap(`
  <ellipse cx="40" cy="40" rx="32" ry="28" fill="${light}" stroke="${s}" stroke-width="1.6"/>
  <circle cx="40" cy="38" r="11" fill="${p}" opacity="0.85"/>
  <circle cx="40" cy="38" r="4" fill="${s}"/>
  <ellipse cx="24" cy="28" rx="4" ry="3" fill="${p}" opacity="0.5"/>
  <ellipse cx="56" cy="48" rx="5" ry="3.5" fill="${p}" opacity="0.45"/>
`);
    case 'nucleus':
      return svgWrap(`
  <circle cx="40" cy="40" r="28" fill="${light}" stroke="${s}" stroke-width="1.6"/>
  <circle cx="40" cy="40" r="12" fill="${p}" opacity="0.8"/>
  <circle cx="36" cy="36" r="3" fill="${s}"/>
  <circle cx="46" cy="42" r="2.5" fill="${s}"/>
`);
    case 'bacteria':
      return svgWrap(`
  <ellipse cx="40" cy="40" rx="28" ry="14" fill="${light}" stroke="${s}" stroke-width="1.6"/>
  <ellipse cx="40" cy="40" rx="10" ry="6" fill="${p}" opacity="0.55"/>
  <path d="M12 36 Q6 28 10 22" stroke="${s}" stroke-width="1.5" fill="none"/>
  <path d="M68 44 Q74 52 70 58" stroke="${s}" stroke-width="1.5" fill="none"/>
`);
    case 'virus':
      return svgWrap(`
  <circle cx="40" cy="40" r="15" fill="${light}" stroke="${s}" stroke-width="1.5"/>
  <circle cx="40" cy="40" r="6" fill="${p}"/>
  <g stroke="${s}" stroke-width="2" stroke-linecap="round">
    <line x1="40" y1="14" x2="40" y2="25"/><circle cx="40" cy="12" r="3" fill="${p}" stroke="none"/>
    <line x1="40" y1="55" x2="40" y2="66"/><circle cx="40" cy="68" r="3" fill="${p}" stroke="none"/>
    <line x1="14" y1="40" x2="25" y2="40"/><circle cx="12" cy="40" r="3" fill="${p}" stroke="none"/>
    <line x1="55" y1="40" x2="66" y2="40"/><circle cx="68" cy="40" r="3" fill="${p}" stroke="none"/>
    <line x1="20" y1="20" x2="28" y2="28"/><circle cx="18" cy="18" r="3" fill="${p}" stroke="none"/>
    <line x1="52" y1="52" x2="60" y2="60"/><circle cx="62" cy="62" r="3" fill="${p}" stroke="none"/>
  </g>
`);
    case 'dna':
      return svgWrap(`
  <path d="M28 8 C48 20, 48 32, 28 40 C8 48, 8 60, 28 72" stroke="${p}" stroke-width="2.6" fill="none"/>
  <path d="M52 8 C32 20, 32 32, 52 40 C72 48, 72 60, 52 72" stroke="${s}" stroke-width="2.6" fill="none"/>
  <line x1="30" y1="16" x2="50" y2="16" stroke="${light}" stroke-width="1.5"/>
  <line x1="26" y1="28" x2="54" y2="28" stroke="${light}" stroke-width="1.5"/>
  <line x1="28" y1="40" x2="52" y2="40" stroke="${light}" stroke-width="1.5"/>
  <line x1="26" y1="52" x2="54" y2="52" stroke="${light}" stroke-width="1.5"/>
  <line x1="30" y1="64" x2="50" y2="64" stroke="${light}" stroke-width="1.5"/>
`);
    case 'protein':
      return svgWrap(`
  <ellipse cx="40" cy="42" rx="26" ry="22" fill="${light}" stroke="${s}" stroke-width="1.5"/>
  <ellipse cx="32" cy="36" rx="10" ry="8" fill="${p}" opacity="0.7"/>
  <ellipse cx="50" cy="48" rx="12" ry="9" fill="${p}" opacity="0.55"/>
  <circle cx="44" cy="30" r="6" fill="${light}"/>
`);
    case 'antibody':
      return svgWrap(`
  <path d="M40 72 L40 40" stroke="${p}" stroke-width="6" stroke-linecap="round"/>
  <path d="M40 40 L20 16" stroke="${p}" stroke-width="6" stroke-linecap="round"/>
  <path d="M40 40 L60 16" stroke="${p}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="20" cy="14" r="5" fill="${light}" stroke="${s}" stroke-width="1"/>
  <circle cx="60" cy="14" r="5" fill="${light}" stroke="${s}" stroke-width="1"/>
`);
    case 'flask':
      return svgWrap(`
  <path d="M30 12 L30 34 L16 64 C14 68, 16 72, 22 72 L58 72 C64 72, 66 68, 64 64 L50 34 L50 12"
        stroke="${s}" stroke-width="2" fill="${light}"/>
  <path d="M18 58 L62 58 L58 68 L22 68 Z" fill="${p}" opacity="0.65"/>
  <rect x="28" y="8" width="24" height="6" rx="2" fill="${s}"/>
`);
    case 'pipette':
      // Micropipette: plunger → body → shaft → tip (vertical, lab-style)
      return svgWrap(`
  <rect x="34" y="3" width="12" height="7" rx="2.5" fill="${s}"/>
  <rect x="36" y="9" width="8" height="5" rx="1.5" fill="${p}"/>
  <rect x="30" y="14" width="20" height="26" rx="5" fill="${light}" stroke="${s}" stroke-width="1.5"/>
  <rect x="34" y="20" width="12" height="10" rx="2" fill="#ffffff" opacity="0.85" stroke="${p}" stroke-width="1"/>
  <line x1="36" y1="25" x2="44" y2="25" stroke="${s}" stroke-width="0.9" stroke-linecap="round"/>
  <rect x="35" y="40" width="10" height="16" rx="2.5" fill="${light}" stroke="${s}" stroke-width="1.3"/>
  <rect x="33" y="54" width="14" height="6" rx="2" fill="${p}" opacity="0.9"/>
  <path d="M35 60 L33 70 L47 70 L45 60 Z" fill="${light}" stroke="${s}" stroke-width="1.2"/>
  <path d="M35 70 L38 76 L42 76 L45 70 Z" fill="${p}" opacity="0.75" stroke="${s}" stroke-width="1"/>
  <ellipse cx="40" cy="76.5" rx="1.6" ry="1.2" fill="${s}"/>
`);
    case 'arrow':
      return svgWrap(`
  <path d="M12 40 L52 40" stroke="${p}" stroke-width="4" stroke-linecap="round"/>
  <path d="M48 28 L64 40 L48 52" stroke="${p}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
`);
    case 'circle':
      return svgWrap(`
  <circle cx="40" cy="40" r="28" fill="${light}" stroke="${s}" stroke-width="2"/>
  <circle cx="40" cy="40" r="14" fill="${p}" opacity="0.85"/>
`);
    case 'hexagon':
      return svgWrap(`
  <path d="M40 10 L64 24 L64 52 L40 66 L16 52 L16 24 Z" fill="${light}" stroke="${s}" stroke-width="1.8"/>
  <circle cx="40" cy="38" r="10" fill="${p}" opacity="0.75"/>
`);
    case 'star':
      return svgWrap(`
  <path d="M40 12 L46 30 L66 30 L50 42 L56 60 L40 48 L24 60 L30 42 L14 30 L34 30 Z"
        fill="${light}" stroke="${s}" stroke-width="1.4" stroke-linejoin="round"/>
`);
    case 'label':
      return svgWrap(`
  <rect x="8" y="26" width="64" height="28" rx="10" fill="${light}" stroke="${s}" stroke-width="1.5"/>
  <text x="40" y="44" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="600" fill="${s}">${esc((opts.label || 'Label').slice(0, 10))}</text>
`);
    case 'cas9_dna':
      // Wider artboard for interaction scene
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100" fill="none">
  <path d="M12 20 C28 32, 28 40, 12 52 C-4 64, -4 72, 12 84" stroke="${p}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M36 20 C20 32, 20 40, 36 52 C52 64, 52 72, 36 84" stroke="${s}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <line x1="14" y1="28" x2="34" y2="28" stroke="${light}" stroke-width="1.4"/>
  <line x1="12" y1="40" x2="36" y2="40" stroke="${light}" stroke-width="1.4"/>
  <line x1="14" y1="52" x2="34" y2="52" stroke="${light}" stroke-width="1.4"/>
  <line x1="12" y1="64" x2="36" y2="64" stroke="${light}" stroke-width="1.4"/>
  <line x1="14" y1="76" x2="34" y2="76" stroke="${light}" stroke-width="1.4"/>
  <path d="M36 40 C52 38, 60 36, 72 42" stroke="${p}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <path d="M36 56 C50 54, 58 52, 70 58" stroke="${s}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <ellipse cx="108" cy="48" rx="38" ry="32" fill="${light}" stroke="${s}" stroke-width="1.8"/>
  <ellipse cx="92" cy="42" rx="18" ry="16" fill="${p}" opacity="0.55" stroke="${s}" stroke-width="1.1"/>
  <ellipse cx="122" cy="52" rx="20" ry="18" fill="${p}" opacity="0.7" stroke="${s}" stroke-width="1.1"/>
  <ellipse cx="100" cy="50" rx="10" ry="8" fill="#fff1f2" stroke="${p}" stroke-width="1" opacity="0.9"/>
  <path d="M78 36 C84 30, 96 28, 104 34" stroke="${s}" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M78 64 C86 70, 98 72, 108 66" stroke="${s}" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M68 44 L74 50 L68 56" stroke="#e11d48" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="71" cy="50" r="2.2" fill="#fb7185"/>
  <text x="24" y="14" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="600" fill="${s}">DNA</text>
  <text x="118" y="14" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="600" fill="${s}">Cas9</text>
  <text x="80" y="96" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8" fill="${s}" opacity="0.75">DNA–Cas9 interaction</text>
</svg>`;
    default:
      return svgWrap(`
  <circle cx="40" cy="40" r="26" fill="${light}" stroke="${s}" stroke-width="2"/>
  <text x="40" y="45" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="${s}">?</text>
`);
  }
}

function svgWrap(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" fill="none">
${inner.trim()}
</svg>`;
}

/** Mix hex color toward white/black. t=0 → a, t=1 → b */
function mix(a, b, t) {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  if (!pa || !pb) return a;
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bch = Math.round(pa.b + (pb.b - pa.b) * t);
  return rgbToHex(r, g, bch);
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  return (
    '#' +
    [r, g, b]
      .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0'))
      .join('')
  );
}
