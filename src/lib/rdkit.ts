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
  get_svg: (width?: number, height?: number) => string;
  get_svg_with_highlights: (details: string) => string;
};

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
   * When true (default), SVG has no opaque plate so canvas layering stays clean.
   * UI thumbs use a CSS white card behind the transparent SVG.
   */
  transparent?: boolean;
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

/**
 * Draw a SMILES string to a clean SVG via RDKit (live — no image files).
 * Returns null if SMILES is invalid or RDKit fails.
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

      // Fresh 2D layout — CoordGen when ACS mode for more regular geometry
      if (typeof mol.set_new_coords === 'function') {
        try {
          mol.set_new_coords(!!opts.acs);
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
      const acs = !!opts.acs;
      // Default transparent so placed molecules don't mask other objects
      const transparent = opts.transparent !== false;

      const details: Record<string, unknown> = {
        width: w,
        height: h,
        bondLineWidth: acs ? 1.8 : 2.2,
        addStereoAnnotation: true,
        clearBackground: true,
        // Fully transparent plate (alpha 0) — thumbs sit on CSS white cards
        backgroundColour: transparent ? [1, 1, 1, 0] : [1, 1, 1, 1],
        padding: acs ? 0.12 : 0.08,
        // Uniform bond length in pixels (ACS-like equalized skeleton)
        fixedBondLength: acs ? 28 : -1,
        multipleBondOffset: acs ? 0.18 : 0.15,
        additionalAtomLabelPadding: 0.0,
        explicitMethyl: false,
        atomColourPalette: {
          '-1': hexToRgb01(color),
          0: hexToRgb01(color),
          1: hexToRgb01(color),
          6: hexToRgb01(color),
          7: hexToRgb01('#1e5bb8'),
          8: hexToRgb01('#c62828'),
          9: hexToRgb01('#2e7d32'),
          15: hexToRgb01('#7b1fa2'),
          16: hexToRgb01('#f9a825'),
          17: hexToRgb01('#2e7d32'),
          35: hexToRgb01('#8d6e63'),
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
