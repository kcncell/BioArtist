/**
 * Reliable ways to append a structure to a live Ketcher instance.
 *
 * - Prefer SMILES (molfile failures are often silent)
 * - Place next to the existing molecule at ACS bond scale
 * - Preserve zoom AND viewport (viewBox) so the canvas does not jump away
 * - Select only the newly added fragment so drag moves just that structure
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KetcherLike = any;

export type AddStructureInput = {
  smiles?: string;
  molfile?: string;
  /** Model coordinates for placement (drop point). */
  position?: { x: number; y: number };
};

export type AddStructureResult = {
  ok: boolean;
  smiles: string;
  method: 'addFragment-smiles' | 'addFragment-molfile' | 'setMolecule-join' | 'none';
  error?: string;
};

const ADJACENT_GAP = 1.4;

type ViewSnapshot = {
  zoom: number | null;
  viewBox: { minX: number; minY: number; width: number; height: number } | null;
};

async function readSmiles(ketcher: KetcherLike): Promise<string> {
  try {
    return ((await ketcher.getSmiles()) || '').trim();
  } catch {
    return '';
  }
}

function looksLikeMolfile(s: string): boolean {
  return /\n/.test(s) || /M\s+END/i.test(s) || /V2000|V3000/i.test(s);
}

function getMolecule(ketcher: KetcherLike) {
  try {
    return (
      ketcher.editor?.struct?.() ??
      ketcher.editor?.render?.ctab?.molecule ??
      null
    );
  } catch {
    return null;
  }
}

function snapshotView(ketcher: KetcherLike): ViewSnapshot {
  try {
    const editor = ketcher.editor;
    const zoom = typeof editor?.zoom === 'function' ? editor.zoom() : null;
    const vb = editor?.render?.viewBox;
    const viewBox =
      vb &&
      Number.isFinite(vb.minX) &&
      Number.isFinite(vb.minY) &&
      Number.isFinite(vb.width) &&
      Number.isFinite(vb.height)
        ? { minX: vb.minX, minY: vb.minY, width: vb.width, height: vb.height }
        : null;
    return {
      zoom: typeof zoom === 'number' && zoom > 0 ? zoom : null,
      viewBox,
    };
  } catch {
    return { zoom: null, viewBox: null };
  }
}

/** Restore zoom + scroll so addFragment's centerViewport does not empty the screen. */
function restoreView(ketcher: KetcherLike, snap: ViewSnapshot): void {
  try {
    const editor = ketcher.editor;
    const render = editor?.render;
    if (!editor || !render) return;
    if (snap.zoom != null && typeof editor.zoom === 'function') {
      editor.zoom(snap.zoom);
    }
    if (snap.viewBox && typeof render.setViewBox === 'function') {
      render.setViewBox({
        ...render.viewBox,
        minX: snap.viewBox.minX,
        minY: snap.viewBox.minY,
        width: snap.viewBox.width,
        height: snap.viewBox.height,
      });
    }
  } catch {
    /* ignore */
  }
}

function collectAtomBondIds(mol: {
  atoms?: { forEach: (fn: (a: unknown, id: number) => void) => void };
  bonds?: { forEach: (fn: (b: unknown, id: number) => void) => void };
}): { atoms: number[]; bonds: number[] } {
  const atoms: number[] = [];
  const bonds: number[] = [];
  mol?.atoms?.forEach((_, id) => atoms.push(id));
  mol?.bonds?.forEach((_, id) => bonds.push(id));
  return { atoms, bonds };
}

/** Select only atoms/bonds that appeared after an add (so drag moves the new structure only). */
function selectNewStructure(
  ketcher: KetcherLike,
  beforeAtoms: Set<number>,
  beforeBonds: Set<number>,
): void {
  try {
    const editor = ketcher.editor;
    const mol = getMolecule(ketcher);
    if (!editor || !mol) return;
    const atoms: number[] = [];
    const bonds: number[] = [];
    mol.atoms.forEach((_: unknown, id: number) => {
      if (!beforeAtoms.has(id)) atoms.push(id);
    });
    mol.bonds.forEach((_: unknown, id: number) => {
      if (!beforeBonds.has(id)) bonds.push(id);
    });
    if (atoms.length || bonds.length) {
      editor.selection({ atoms, bonds });
    }
  } catch {
    /* ignore */
  }
}

export function computeAdjacentPlacement(ketcher: KetcherLike): { x: number; y: number } | undefined {
  try {
    const mol = getMolecule(ketcher);
    if (!mol?.atoms || mol.atoms.size === 0) return undefined;
    const bb = mol.getCoordBoundingBox?.();
    if (!bb?.min || !bb?.max) return undefined;
    const minY = Number(bb.min.y);
    const maxX = Number(bb.max.x);
    if (![minY, maxX].every((n) => Number.isFinite(n))) return undefined;
    return {
      x: maxX + ADJACENT_GAP,
      y: minY,
    };
  } catch {
    return undefined;
  }
}

/** Ketcher addFragment flips y once; pass model y negated so final model y is correct. */
function toAddFragmentPosition(model: { x: number; y: number }): { x: number; y: number } {
  return { x: model.x, y: -model.y };
}

/**
 * Append structure without clearing the canvas.
 * Places next to existing content (or at drop position) and preserves the view.
 */
export async function addStructureToKetcher(
  ketcher: KetcherLike,
  input: AddStructureInput,
): Promise<AddStructureResult> {
  if (!ketcher || typeof ketcher.addFragment !== 'function') {
    return { ok: false, smiles: '', method: 'none', error: 'Ketcher not ready' };
  }

  const smiles = (input.smiles || '').trim();
  const molfile = (input.molfile || '').trim();
  const before = await readSmiles(ketcher);
  const viewSnap = snapshotView(ketcher);

  const molBefore = getMolecule(ketcher);
  const idsBefore = collectAtomBondIds(molBefore || {});
  const beforeAtoms = new Set(idsBefore.atoms);
  const beforeBonds = new Set(idsBefore.bonds);

  const modelPos =
    input.position ?? (before ? computeAdjacentPlacement(ketcher) : undefined);
  const position = modelPos ? toAddFragmentPosition(modelPos) : undefined;

  const finishOk = async (method: AddStructureResult['method']): Promise<AddStructureResult | null> => {
    await new Promise((r) => setTimeout(r, 40));
    restoreView(ketcher, viewSnap);
    const after = await readSmiles(ketcher);
    if (after && (after !== before || !before)) {
      selectNewStructure(ketcher, beforeAtoms, beforeBonds);
      // Keep view again after selection side-effects
      restoreView(ketcher, viewSnap);
      return { ok: true, smiles: after, method };
    }
    return null;
  };

  const tryAddFragment = async (
    payload: string,
    method: AddStructureResult['method'],
  ): Promise<AddStructureResult | null> => {
    if (!payload) return null;
    try {
      await ketcher.addFragment(payload, {
        position,
        needZoom: false,
      });
      return await finishOk(method);
    } catch (err) {
      console.warn('[ChemStudio] addFragment failed', method, err);
      restoreView(ketcher, viewSnap);
      return null;
    }
  };

  if (smiles && !looksLikeMolfile(smiles)) {
    const r = await tryAddFragment(smiles, 'addFragment-smiles');
    if (r) return r;
  }

  if (molfile) {
    const r = await tryAddFragment(molfile, 'addFragment-molfile');
    if (r) return r;
  }

  if (smiles && !looksLikeMolfile(smiles) && typeof ketcher.setMolecule === 'function') {
    try {
      const combined = before ? `${before}.${smiles}` : smiles;
      await ketcher.setMolecule(combined, { needZoom: false });
      await new Promise((r) => setTimeout(r, 40));
      restoreView(ketcher, viewSnap);
      try {
        nudgeDisconnectedFragments(ketcher);
      } catch {
        /* optional */
      }
      restoreView(ketcher, viewSnap);
      const after = await readSmiles(ketcher);
      if (after && (after !== before || !before)) {
        selectNewStructure(ketcher, beforeAtoms, beforeBonds);
        restoreView(ketcher, viewSnap);
        return { ok: true, smiles: after, method: 'setMolecule-join' };
      }
    } catch (err) {
      console.warn('[ChemStudio] setMolecule join failed', err);
      restoreView(ketcher, viewSnap);
      return {
        ok: false,
        smiles: before,
        method: 'none',
        error: err instanceof Error ? err.message : 'setMolecule failed',
      };
    }
  }

  restoreView(ketcher, viewSnap);
  return {
    ok: false,
    smiles: before,
    method: 'none',
    error: smiles || molfile ? 'Structure did not change the canvas' : 'No SMILES or molfile',
  };
}

function nudgeDisconnectedFragments(ketcher: KetcherLike): void {
  const editor = ketcher.editor;
  const mol = getMolecule(ketcher);
  if (!editor || !mol?.frags || mol.frags.size <= 1) return;

  type FragBox = {
    fid: number;
    atomIds: number[];
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  const frags = new Map<number, FragBox>();

  mol.atoms.forEach((atom: { fragment: number; pp: { x: number; y: number } }, aid: number) => {
    const fid = atom.fragment;
    if (fid == null) return;
    let box = frags.get(fid);
    if (!box) {
      box = {
        fid,
        atomIds: [],
        minX: atom.pp.x,
        minY: atom.pp.y,
        maxX: atom.pp.x,
        maxY: atom.pp.y,
      };
      frags.set(fid, box);
    }
    box.atomIds.push(aid);
    box.minX = Math.min(box.minX, atom.pp.x);
    box.minY = Math.min(box.minY, atom.pp.y);
    box.maxX = Math.max(box.maxX, atom.pp.x);
    box.maxY = Math.max(box.maxY, atom.pp.y);
  });

  const ordered = [...frags.values()].sort((a, b) => a.minX - b.minX || a.fid - b.fid);
  if (ordered.length <= 1) return;

  let cursorX = ordered[0]!.maxX;
  const baseTop = ordered[0]!.minY;

  for (let i = 1; i < ordered.length; i++) {
    const frag = ordered[i]!;
    const targetMinX = cursorX + ADJACENT_GAP;
    const dx = targetMinX - frag.minX;
    const dy = baseTop - frag.minY;
    for (const aid of frag.atomIds) {
      const atom = mol.atoms.get(aid);
      if (!atom?.pp) continue;
      atom.pp.x += dx;
      atom.pp.y += dy;
    }
    frag.maxX += dx;
    cursorX = frag.maxX;
  }

  try {
    editor.render?.update?.(true);
  } catch {
    /* ignore */
  }
}
