/**
 * Lazy-loaded RDKit.js (WASM) — SMILES → SVG for chemistry motifs.
 * WASM is served from /rdkit/ (copied from @rdkit/rdkit dist).
 *
 * No pre-baked images needed: each structure is drawn live in the browser.
 */

export type RDKitModule = {
  version: () => string;
  get_mol: (input: string, details_json?: string) => RDKitMol | null;
  get_qmol: (input: string) => RDKitMol | null;
};

export type RDKitMol = {
  delete: () => void;
  is_valid?: () => boolean;
  has_coords?: () => boolean;
  set_new_coords?: (useCoordGen?: boolean) => boolean;
  get_smiles: () => string;
  get_molblock?: () => string;
  get_svg: (width?: number, height?: number) => string;
  get_svg_with_highlights: (details: string) => string;
};

/** Drawing styles for Chem Studio preview / figure export */
export type ChemDrawStyle = '2d' | 'ballstick' | 'cpk' | 'wire';

type InitFn = (options?: { locateFile?: (file: string) => string }) => Promise<RDKitModule>;

let rdkitPromise: Promise<RDKitModule> | null = null;

function loadInitScript(): Promise<InitFn> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { initRDKitModule?: InitFn };
    if (typeof w.initRDKitModule === 'function') {
      resolve(w.initRDKitModule);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-rdkit]');
    if (existing) {
      existing.addEventListener('load', () => {
        if (typeof w.initRDKitModule === 'function') resolve(w.initRDKitModule);
        else reject(new Error('RDKit init missing after script load'));
      });
      existing.addEventListener('error', () => reject(new Error('Failed to load RDKit script')));
      return;
    }
    const script = document.createElement('script');
    script.src = '/rdkit/RDKit_minimal.js';
    script.async = true;
    script.dataset.rdkit = '1';
    script.onload = () => {
      if (typeof w.initRDKitModule === 'function') resolve(w.initRDKitModule);
      else reject(new Error('initRDKitModule not found'));
    };
    script.onerror = () => reject(new Error('Failed to load /rdkit/RDKit_minimal.js'));
    document.head.appendChild(script);
  });
}

/** Load RDKit once (cached). Safe to call from multiple panels. */
export function getRDKit(): Promise<RDKitModule> {
  if (!rdkitPromise) {
    rdkitPromise = loadInitScript().then((init) =>
      init({
        locateFile: (file: string) => `/rdkit/${file}`,
      }),
    );
  }
  return rdkitPromise;
}

export type DrawMolOptions = {
  width?: number;
  height?: number;
  /** Hex bond/carbon color (default deep black for white artboard) */
  color?: string;
  /**
   * ACS-style uniform bond lengths + publication-ish drawing.
   * Uses fixedBondLength + CoordGen 2D coords when available.
   */
  acs?: boolean;
  /**
   * Visual style: 2d ACS · ball-and-stick · CPK space-fill · CPK wireframe.
   * Default '2d'.
   */
  style?: ChemDrawStyle;
  /**
   * When true (default), SVG has no opaque plate so canvas layering stays clean.
   * UI thumbs use a CSS white card behind the transparent SVG.
   */
  transparent?: boolean;
};

/**
 * CPK (Corey–Pauling–Koltun) coloring — Wikipedia / Rasmol / Jmol standard.
 * Used for ball-and-stick atom spheres (and half-bonds when desired).
 * @see https://en.wikipedia.org/wiki/CPK_coloring
 */
export const CPK_COLORS: Record<string, string> = {
  H: '#FFFFFF',
  C: '#909090', // light gray (classic CPK carbon)
  N: '#3050F8', // blue
  O: '#FF0D0D', // red
  F: '#90E050', // green
  Cl: '#1FF01F',
  Br: '#A62929',
  I: '#940094',
  P: '#FF8000', // orange
  S: '#FFFF30', // yellow
  B: '#FFB5B5',
  He: '#D9FFFF',
  Li: '#CC80FF',
  Be: '#C2FF00',
  Na: '#AB5CF2',
  Mg: '#8AFF00',
  Al: '#BFA6A6',
  Si: '#F0C8A0',
  K: '#8F40D4',
  Ca: '#3DFF00',
  Fe: '#E06633',
  Zn: '#7D80B0',
  default: '#FF1493',
};

/** Covalent radii (Å) — ball size in ball-and-stick (~not full VdW) */
const COVALENT_R: Record<string, number> = {
  H: 0.31,
  C: 0.76,
  N: 0.71,
  O: 0.66,
  F: 0.57,
  Cl: 0.99,
  Br: 1.14,
  I: 1.33,
  P: 1.07,
  S: 1.05,
  B: 0.84,
  Si: 1.11,
  default: 0.75,
};

/** RDKit WASM is not re-entrant — serialize all mol draw calls. */
let drawChain: Promise<unknown> = Promise.resolve();

function enqueueDraw<T>(fn: () => Promise<T>): Promise<T> {
  const next = drawChain.then(fn, fn);
  // Keep chain alive even if this job rejects
  drawChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

type Atom2D = { x: number; y: number; el: string; i: number };
type Bond2D = { a: number; b: number; order: number };

/** Normalize element symbol (C, N, Cl, …). */
function normEl(raw: string): string {
  const s = raw.replace(/[^A-Za-z]/g, '');
  if (!s) return 'C';
  if (s.length === 1) return s.toUpperCase();
  return s[0].toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Parse V2000 molblock. Prefer fixed-width columns (MDL spec):
 * x: 0–10, y: 10–20, z: 20–30, symbol: 31–34
 */
function parseMolblock2D(molblock: string): { atoms: Atom2D[]; bonds: Bond2D[] } | null {
  const lines = molblock.replace(/\r\n/g, '\n').split('\n');
  let countsIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('V2000') || lines[i].includes('V3000')) {
      countsIdx = i;
      break;
    }
  }
  if (countsIdx < 0) {
    for (let i = 3; i < Math.min(lines.length, 10); i++) {
      if (/^\s*\d+\s+\d+/.test(lines[i])) {
        countsIdx = i;
        break;
      }
    }
  }
  if (countsIdx < 0) return null;
  const counts = lines[countsIdx].match(/^\s*(\d+)\s+(\d+)/);
  if (!counts) return null;
  const nAtoms = Number(counts[1]);
  const nBonds = Number(counts[2]);
  if (!nAtoms || nAtoms > 500) return null;

  const atoms: Atom2D[] = [];
  for (let i = 0; i < nAtoms; i++) {
    const line = lines[countsIdx + 1 + i] || '';
    // Fixed-width first (pad to length)
    const padded = line.padEnd(40, ' ');
    let x = Number(padded.slice(0, 10).trim());
    let y = Number(padded.slice(10, 20).trim());
    let el = padded.slice(31, 34).trim();
    if (!Number.isFinite(x) || !Number.isFinite(y) || !el) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) return null;
      x = Number(parts[0]);
      y = Number(parts[1]);
      el = parts[3];
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    atoms.push({ x, y, el: normEl(el), i });
  }

  const bonds: Bond2D[] = [];
  for (let i = 0; i < nBonds; i++) {
    const line = (lines[countsIdx + 1 + nAtoms + i] || '').padEnd(20, ' ');
    let a = Number(line.slice(0, 3).trim()) - 1;
    let b = Number(line.slice(3, 6).trim()) - 1;
    let order = Number(line.slice(6, 9).trim()) || 1;
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0) {
      const parts = line.trim().split(/\s+/);
      a = Number(parts[0]) - 1;
      b = Number(parts[1]) - 1;
      order = Number(parts[2]) || 1;
    }
    if (a >= 0 && b >= 0 && a < nAtoms && b < nAtoms) bonds.push({ a, b, order });
  }
  return { atoms, bonds };
}

function cpkColor(el: string): string {
  const key = normEl(el);
  return CPK_COLORS[key] || CPK_COLORS.default;
}

function covalentR(el: string): number {
  const key = normEl(el);
  return COVALENT_R[key] || COVALENT_R.default;
}

/**
 * Ball-and-stick (2D projection of the classic model):
 * - **Balls** = atom nuclei as small spheres colored with the CPK scheme
 *   (C gray, O red, N blue, S yellow, H white, …).
 * - **Sticks** = bonds as cylinders; each half of a stick takes the CPK color
 *   of its endpoint atom (common educational depiction).
 * Sphere radius uses covalent radii (not full VdW space-fill), so sticks stay visible.
 */
function buildBallStickSvg(
  atoms: Atom2D[],
  bonds: Bond2D[],
  w: number,
  h: number,
): string {
  if (!atoms.length) return '';

  // Nucleus bbox in Å, expanded by ball radius so nothing clips
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const a of atoms) {
    const r = covalentR(a.el) * 0.85;
    minX = Math.min(minX, a.x - r);
    maxX = Math.max(maxX, a.x + r);
    minY = Math.min(minY, a.y - r);
    maxY = Math.max(maxY, a.y + r);
  }

  const padPx = 20;
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const scale = Math.min((w - padPx * 2) / spanX, (h - padPx * 2) / spanY);

  const ox = (w - spanX * scale) / 2 - minX * scale;
  const oy = (h + spanY * scale) / 2 + minY * scale;
  const tx = (x: number) => ox + x * scale;
  const ty = (y: number) => oy - y * scale;

  const meanBondA =
    bonds.length > 0
      ? bonds.reduce((s, b) => {
          const A = atoms[b.a];
          const B = atoms[b.b];
          return s + Math.hypot(A.x - B.x, A.y - B.y);
        }, 0) / bonds.length
      : 1.4;
  const bondPx = meanBondA * scale;
  // Stick thickness ~ 15% of bond length, capped
  const stickW = Math.max(2.5, Math.min(6, bondPx * 0.16));

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet">`,
  );
  // Soft gray board so white H and yellow S stay visible
  parts.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="#e8eaed"/>`);

  // Sticks first (under balls), half-colored CPK
  for (const b of bonds) {
    const A = atoms[b.a];
    const B = atoms[b.b];
    const x1 = tx(A.x);
    const y1 = ty(A.y);
    const x2 = tx(B.x);
    const y2 = ty(B.y);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const cA = cpkColor(A.el);
    const cB = cpkColor(B.el);

    const half = (x0: number, y0: number, x1b: number, y1b: number, col: string, width: number) => {
      parts.push(
        `<line x1="${x0}" y1="${y0}" x2="${x1b}" y2="${y1b}" stroke="${col}" stroke-width="${width}" stroke-linecap="butt"/>`,
      );
    };

    const drawOrder = (off: number, width: number) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const px = (-dy / len) * off;
      const py = (dx / len) * off;
      half(x1 + px, y1 + py, mx + px, my + py, cA, width);
      half(mx + px, my + py, x2 + px, y2 + py, cB, width);
    };

    drawOrder(0, stickW);
    if (b.order >= 2) drawOrder(stickW * 1.15, stickW * 0.85);
    if (b.order >= 3) drawOrder(stickW * 2.15, stickW * 0.75);
  }

  // Balls on top — covalent radius scaled; always dark outline for contrast
  const sorted = [...atoms].sort((a, b) => a.y - b.y);
  for (const a of sorted) {
    const r = Math.max(3.5, covalentR(a.el) * 0.85 * scale);
    const cx = tx(a.x);
    const cy = ty(a.y);
    const fill = cpkColor(a.el);
    // Outer ring so light colors (H, S, C gray) read on any bg
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="#111111" stroke-width="${Math.max(1, r * 0.08)}"/>`,
    );
    // Specular highlight
    parts.push(
      `<circle cx="${cx - r * 0.28}" cy="${cy - r * 0.28}" r="${r * 0.3}" fill="rgba(255,255,255,0.55)"/>`,
    );
    // Heteroatom label
    if (a.el !== 'C' && a.el !== 'H') {
      const fs = Math.max(8, Math.min(13, r * 0.95));
      const light = a.el === 'S' || a.el === 'F' || a.el === 'Cl' || a.el === 'Br';
      parts.push(
        `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="Inter,system-ui,sans-serif" font-size="${fs}" font-weight="700" fill="${light ? '#111' : '#fff'}">${a.el}</text>`,
      );
    }
  }

  // Mini legend so users see CPK is intentional
  const legend = [
    ['C', CPK_COLORS.C],
    ['N', CPK_COLORS.N],
    ['O', CPK_COLORS.O],
    ['S', CPK_COLORS.S],
    ['H', CPK_COLORS.H],
  ];
  let lx = 12;
  const ly = h - 14;
  parts.push(
    `<text x="12" y="${ly - 12}" font-family="system-ui,sans-serif" font-size="9" fill="#555">CPK ball &amp; stick</text>`,
  );
  for (const [sym, col] of legend) {
    parts.push(
      `<circle cx="${lx + 5}" cy="${ly}" r="5" fill="${col}" stroke="#111" stroke-width="0.6"/>`,
    );
    parts.push(
      `<text x="${lx + 13}" y="${ly + 3}" font-family="system-ui,sans-serif" font-size="9" fill="#333">${sym}</text>`,
    );
    lx += 28;
  }

  parts.push('</svg>');
  return parts.join('');
}

/** Dispatch styled SVG (currently ball-and-stick; other modes reuse it until implemented). */
function buildStyledSvgFromCoords(
  atoms: Atom2D[],
  bonds: Bond2D[],
  style: ChemDrawStyle,
  w: number,
  h: number,
  _transparent: boolean,
): string {
  // Focus: CPK ball-and-stick. Other styles fall through to the same model for now.
  void style;
  return buildBallStickSvg(atoms, bonds, w, h);
}

/**
 * Draw a SMILES / molfile string to a clean SVG via RDKit (live — no image files).
 * Returns null if structure is invalid or RDKit fails.
 */
export async function smilesToSvg(
  smiles: string,
  opts: DrawMolOptions = {},
): Promise<string | null> {
  const s = smiles.trim();
  if (!s) return null;

  return enqueueDraw(async () => {
    const RDKit = await getRDKit();
    const mol = RDKit.get_mol(s);
    if (!mol) return null;
    try {
      if (typeof mol.is_valid === 'function' && !mol.is_valid()) {
        return null;
      }

      const style: ChemDrawStyle = opts.style || (opts.acs === false ? '2d' : '2d');
      const useAcsLayout = style === '2d' || opts.acs !== false;

      // Fresh 2D layout — CoordGen for ACS-regular geometry
      if (typeof mol.set_new_coords === 'function') {
        try {
          mol.set_new_coords(useAcsLayout);
        } catch {
          try {
            mol.set_new_coords();
          } catch {
            /* keep whatever coords get_mol produced */
          }
        }
      }

      const w = opts.width ?? 200;
      const h = opts.height ?? 160;
      const color = opts.color ?? '#000000';
      const transparent = opts.transparent !== false;

      // Custom SVG for ballstick / cpk / wire (from molblock coords)
      if (style === 'ballstick' || style === 'cpk' || style === 'wire') {
        const mb = typeof mol.get_molblock === 'function' ? mol.get_molblock() : '';
        const parsed = mb ? parseMolblock2D(mb) : null;
        if (parsed && parsed.atoms.length) {
          return buildStyledSvgFromCoords(
            parsed.atoms,
            parsed.bonds,
            style,
            w,
            h,
            transparent,
          );
        }
        // Fall through to RDKit SVG if molblock parse fails
      }

      // 2D ACS (default) — publication skeleton
      const cpkPalette = {
        '-1': hexToRgb01(color),
        0: hexToRgb01(color),
        1: hexToRgb01('#909090'),
        6: hexToRgb01(color),
        7: hexToRgb01('#3050f8'),
        8: hexToRgb01('#ff0d0d'),
        9: hexToRgb01('#90e050'),
        15: hexToRgb01('#ff8000'),
        16: hexToRgb01('#d4c200'),
        17: hexToRgb01('#1ff01f'),
        35: hexToRgb01('#a62929'),
      };

      const details: Record<string, unknown> = {
        width: w,
        height: h,
        bondLineWidth: 1.8,
        addStereoAnnotation: true,
        clearBackground: true,
        backgroundColour: transparent ? [1, 1, 1, 0] : [1, 1, 1, 1],
        padding: 0.12,
        fixedBondLength: 28,
        multipleBondOffset: 0.18,
        additionalAtomLabelPadding: 0.0,
        explicitMethyl: false,
        // ACS monochrome carbon/hydrogen; hetero keep CPK-ish
        atomColourPalette: {
          ...cpkPalette,
          6: hexToRgb01('#000000'),
          1: hexToRgb01('#000000'),
          0: hexToRgb01('#000000'),
          '-1': hexToRgb01('#000000'),
        },
      };

      let svg: string;
      try {
        svg = mol.get_svg_with_highlights(JSON.stringify(details));
      } catch {
        svg = mol.get_svg(w, h);
      }
      if (!svg || !svg.includes('<svg')) return null;
      return cleanChemSvg(svg, w, h, { transparent });
    } finally {
      mol.delete();
    }
  });
}

function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Normalize RDKit SVG so it reliably renders as <img src="data:…"> and
 * as fabric import. Critical: use absolute pixel width/height (not 100%),
 * strip XML prolog, collapse multi-line opening tag issues.
 */
export function cleanChemSvg(
  svg: string,
  w: number,
  h: number,
  opts: { transparent?: boolean } = {},
): string {
  const transparent = opts.transparent !== false;
  let s = svg.trim();
  // Drop XML declaration — confuses some data-URL parsers
  s = s.replace(/^<\?xml[^?]*\?>\s*/i, '');
  // Normalize root <svg …> (RDKit emits multi-line attributes)
  s = s.replace(/<svg\b[\s\S]*?>/i, () => {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet">`;
  });
  // Strip full-frame background rects so molecules don't mask the artboard
  if (transparent) {
    s = stripOpaqueBackgroundRects(s);
  } else if (!/fill\s*[:=]\s*#fff/i.test(s)) {
    s = s.replace(
      /(<svg[^>]*>)/i,
      `$1<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/>`,
    );
  }
  return s;
}

/** Remove RDKit full-canvas background plates (white / white+alpha). */
export function stripOpaqueBackgroundRects(svg: string): string {
  let s = svg;
  // Self-closing or paired rects that look like the full drawing plate
  s = s.replace(
    /<rect\b[^>]*\b(?:width\s*=\s*['"]?[\d.]+|style\s*=\s*['"][^'"]*fill\s*:\s*#fff)[^>]*\/?\s*>\s*(?:<\/rect>)?/gi,
    (match) => {
      // Keep small decorative rects; drop ones that fill most of the viewBox
      const w = match.match(/\bwidth\s*=\s*['"]?([\d.]+)/i);
      const h = match.match(/\bheight\s*=\s*['"]?([\d.]+)/i);
      const fill =
        /fill\s*[:=]\s*#fff(?:fff)?(?:[0-9a-f]{2})?/i.test(match) ||
        /fill\s*[:=]\s*#ffffff/i.test(match) ||
        /fill\s*[:=]\s*white/i.test(match) ||
        /fill\s*[:=]\s*rgb\(\s*255\s*,\s*255\s*,\s*255/i.test(match);
      if (!fill) return match;
      // RDKit plate is typically the full canvas size (large rect at origin)
      const ww = w ? Number(w[1]) : 0;
      const hh = h ? Number(h[1]) : 0;
      if (ww >= 40 && hh >= 40) return '';
      return match;
    },
  );
  return s;
}

/** Safe data URL for chem thumbs/previews (base64 avoids # / quote issues). */
export function chemSvgToDataUrl(svg: string): string {
  try {
    const b64 = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${b64}`;
  } catch {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
}

export type ChemMotifGroup =
  | 'rings'
  | 'bonds'
  | 'chains'
  | 'hetero'
  | 'drugs'
  | 'amino';

/** Common structure motifs + standard amino acids for the Chem draw panel */
export const CHEM_MOTIFS: {
  id: string;
  name: string;
  smiles: string;
  group: ChemMotifGroup;
}[] = [
  { id: 'benzene', name: 'Benzene', smiles: 'c1ccccc1', group: 'rings' },
  { id: 'cyclohexane', name: 'Cyclohexane', smiles: 'C1CCCCC1', group: 'rings' },
  { id: 'cyclopentane', name: 'Cyclopentane', smiles: 'C1CCCC1', group: 'rings' },
  { id: 'pyridine', name: 'Pyridine', smiles: 'c1ccncc1', group: 'hetero' },
  { id: 'pyrrole', name: 'Pyrrole', smiles: 'c1cc[nH]c1', group: 'hetero' },
  { id: 'furan', name: 'Furan', smiles: 'c1ccoc1', group: 'hetero' },
  { id: 'thiophene', name: 'Thiophene', smiles: 'c1ccsc1', group: 'hetero' },
  { id: 'naphthalene', name: 'Naphthalene', smiles: 'c1ccc2ccccc2c1', group: 'rings' },
  { id: 'single', name: 'Single bond', smiles: 'CC', group: 'bonds' },
  { id: 'double', name: 'Double bond', smiles: 'C=C', group: 'bonds' },
  { id: 'triple', name: 'Triple bond', smiles: 'C#C', group: 'bonds' },
  { id: 'pentane', name: 'Pentane', smiles: 'CCCCC', group: 'chains' },
  { id: 'hexane', name: 'Hexane', smiles: 'CCCCCC', group: 'chains' },
  { id: 'isobutane', name: 'Isobutane', smiles: 'CC(C)C', group: 'chains' },
  { id: 'phenol', name: 'Phenol', smiles: 'c1ccc(O)cc1', group: 'hetero' },
  { id: 'aniline', name: 'Aniline', smiles: 'c1ccc(N)cc1', group: 'hetero' },
  { id: 'carboxylic', name: 'Carboxylic acid', smiles: 'CC(=O)O', group: 'hetero' },
  { id: 'amide', name: 'Amide', smiles: 'CC(=O)N', group: 'hetero' },
  { id: 'aspirin', name: 'Aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O', group: 'drugs' },
  { id: 'caffeine', name: 'Caffeine', smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C', group: 'drugs' },
  { id: 'glucose', name: 'D-Glucose', smiles: 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O', group: 'drugs' },
  { id: 'ethanol', name: 'Ethanol', smiles: 'CCO', group: 'chains' },

  // 20 standard L-amino acids (free acids)
  { id: 'aa-gly', name: 'Gly (G)', smiles: 'NCC(=O)O', group: 'amino' },
  { id: 'aa-ala', name: 'Ala (A)', smiles: 'C[C@H](N)C(=O)O', group: 'amino' },
  { id: 'aa-val', name: 'Val (V)', smiles: 'CC(C)[C@H](N)C(=O)O', group: 'amino' },
  { id: 'aa-leu', name: 'Leu (L)', smiles: 'CC(C)C[C@H](N)C(=O)O', group: 'amino' },
  { id: 'aa-ile', name: 'Ile (I)', smiles: 'CC[C@H](C)[C@H](N)C(=O)O', group: 'amino' },
  { id: 'aa-ser', name: 'Ser (S)', smiles: 'N[C@@H](CO)C(=O)O', group: 'amino' },
  { id: 'aa-thr', name: 'Thr (T)', smiles: 'C[C@@H](O)[C@H](N)C(=O)O', group: 'amino' },
  { id: 'aa-cys', name: 'Cys (C)', smiles: 'N[C@@H](CS)C(=O)O', group: 'amino' },
  { id: 'aa-met', name: 'Met (M)', smiles: 'CSCC[C@H](N)C(=O)O', group: 'amino' },
  { id: 'aa-asp', name: 'Asp (D)', smiles: 'N[C@@H](CC(=O)O)C(=O)O', group: 'amino' },
  { id: 'aa-asn', name: 'Asn (N)', smiles: 'NC(=O)C[C@H](N)C(=O)O', group: 'amino' },
  { id: 'aa-glu', name: 'Glu (E)', smiles: 'N[C@@H](CCC(=O)O)C(=O)O', group: 'amino' },
  { id: 'aa-gln', name: 'Gln (Q)', smiles: 'NC(=O)CC[C@H](N)C(=O)O', group: 'amino' },
  { id: 'aa-lys', name: 'Lys (K)', smiles: 'NCCCC[C@H](N)C(=O)O', group: 'amino' },
  { id: 'aa-arg', name: 'Arg (R)', smiles: 'N[C@@H](CCCNC(=N)N)C(=O)O', group: 'amino' },
  { id: 'aa-his', name: 'His (H)', smiles: 'N[C@@H](Cc1c[nH]cn1)C(=O)O', group: 'amino' },
  { id: 'aa-phe', name: 'Phe (F)', smiles: 'N[C@@H](Cc1ccccc1)C(=O)O', group: 'amino' },
  { id: 'aa-tyr', name: 'Tyr (Y)', smiles: 'N[C@@H](Cc1ccc(O)cc1)C(=O)O', group: 'amino' },
  { id: 'aa-trp', name: 'Trp (W)', smiles: 'N[C@@H](Cc1c[nH]c2ccccc12)C(=O)O', group: 'amino' },
  { id: 'aa-pro', name: 'Pro (P)', smiles: 'O=C(O)[C@@H]1CCCN1', group: 'amino' },
];
