/**
 * Drag-move for the current Chem Studio selection (Ketcher).
 *
 * - Moves selected atoms/bonds, reaction arrows, pluses, and text labels
 * - Snaps molecule selections to nearby structure edges/centers
 * - Runs when the pointer starts on an already-selected item
 * - Empty-canvas drag is handled by marquee selection (not here)
 */
import {
  CoordinateTransformation,
  Vec2,
  fromMultipleMove,
} from 'ketcher-core';
import {
  type AlignGuide,
  type Bounds,
  computeAlignSnap,
} from '../../lib/alignGuides';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KetcherLike = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorLike = any;

type SelectionLists = {
  atoms?: number[];
  bonds?: number[];
  rxnArrows?: number[];
  rxnPluses?: number[];
  texts?: number[];
  simpleObjects?: number[];
  sgroupData?: number[];
  enhancedFlags?: number[];
};

/** Snap thresholds in model units (avg bond length ≈ 1 after rescale). */
const SNAP_MODEL = 0.22;
/** Wider approach so center-to-center lines show before lock. */
const APPROACH_MODEL = 0.75;

function getEditor(ketcher: KetcherLike): EditorLike | null {
  return ketcher?.editor ?? null;
}

function isSelectTool(editor: EditorLike): boolean {
  try {
    const t = editor.tool?.();
    return !!(t && typeof t.isSelectionRunning === 'function');
  } catch {
    return false;
  }
}

function hasSelection(editor: EditorLike): boolean {
  const sel = editor.selection?.() as SelectionLists | null;
  if (!sel) return false;
  return !!(
    sel.atoms?.length ||
    sel.bonds?.length ||
    sel.rxnArrows?.length ||
    sel.rxnPluses?.length ||
    sel.texts?.length ||
    sel.simpleObjects?.length
  );
}

function selectionAtomSet(editor: EditorLike): Set<number> {
  const set = new Set<number>();
  const sel = (editor.selection?.() || {}) as SelectionLists;
  for (const id of sel.atoms || []) set.add(id);
  const mol = editor.render?.ctab?.molecule;
  if (mol && sel.bonds) {
    for (const bid of sel.bonds) {
      const b = mol.bonds.get(bid);
      if (b) {
        set.add(b.begin);
        set.add(b.end);
      }
    }
  }
  return set;
}

function isHitOnSelection(editor: EditorLike, hit: { map: string; id: number } | null): boolean {
  if (!hit) return false;
  const sel = (editor.selection?.() || {}) as SelectionLists;
  const atomSet = selectionAtomSet(editor);
  const mol = editor.render?.ctab?.molecule;

  if (hit.map === 'atoms' && atomSet.has(hit.id)) return true;
  if (hit.map === 'bonds') {
    const b = mol?.bonds?.get?.(hit.id);
    if (b && (atomSet.has(b.begin) || atomSet.has(b.end))) return true;
    if (sel.bonds?.includes(hit.id)) return true;
  }
  if (hit.map === 'rxnArrows' && sel.rxnArrows?.includes(hit.id)) return true;
  if (hit.map === 'rxnPluses' && sel.rxnPluses?.includes(hit.id)) return true;
  if (hit.map === 'texts' && sel.texts?.includes(hit.id)) return true;
  if (hit.map === 'frags' && mol?.atoms) {
    let found = false;
    mol.atoms.forEach((atom: { fragment?: number }, id: number) => {
      if (!found && atom.fragment === hit.id && atomSet.has(id)) found = true;
    });
    if (found) return true;
  }
  return false;
}

function boundsFromAtoms(
  mol: {
    atoms: {
      get: (id: number) => { pp: { x: number; y: number } } | undefined;
      forEach: (fn: (a: { pp: { x: number; y: number }; fragment?: number }, id: number) => void) => void;
    };
  },
  atomIds: Iterable<number>,
): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let n = 0;
  for (const id of atomIds) {
    const a = mol.atoms.get(id);
    if (!a?.pp) continue;
    n++;
    minX = Math.min(minX, a.pp.x);
    minY = Math.min(minY, a.pp.y);
    maxX = Math.max(maxX, a.pp.x);
    maxY = Math.max(maxY, a.pp.y);
  }
  if (!n || !Number.isFinite(minX)) return null;
  return {
    left: minX,
    top: minY,
    right: maxX,
    bottom: maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function boundsFromSelection(editor: EditorLike, atomSet: Set<number>): Bounds | null {
  const mol = editor.render?.ctab?.molecule;
  if (!mol) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let n = 0;

  const addPoint = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    n++;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  const atomBounds = boundsFromAtoms(mol, atomSet);
  if (atomBounds) {
    addPoint(atomBounds.left, atomBounds.top);
    addPoint(atomBounds.right, atomBounds.bottom);
  }

  const sel = (editor.selection?.() || {}) as SelectionLists;

  try {
    for (const id of sel.rxnArrows || []) {
      const arrow = mol.rxnArrows?.get?.(id);
      const pts = arrow?.pos || [];
      for (const p of pts) addPoint(p.x, p.y);
      if (typeof arrow?.center === 'function') {
        const c = arrow.center();
        addPoint(c.x, c.y);
      }
    }
  } catch {
    /* optional */
  }

  try {
    for (const id of sel.rxnPluses || []) {
      const plus = mol.rxnPluses?.get?.(id);
      if (plus?.pp) addPoint(plus.pp.x, plus.pp.y);
    }
  } catch {
    /* optional */
  }

  try {
    for (const id of sel.texts || []) {
      const text = mol.texts?.get?.(id);
      const p = text?.position || text?.pos?.[0];
      if (p) addPoint(p.x, p.y);
    }
  } catch {
    /* optional */
  }

  if (!n || !Number.isFinite(minX)) return null;
  return {
    left: minX,
    top: minY,
    right: maxX,
    bottom: maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function getOtherFragmentBounds(editor: EditorLike, selectedAtoms: Set<number>): Bounds[] {
  const mol = editor.render?.ctab?.molecule;
  if (!mol) return [];
  const byFrag = new Map<number, number[]>();
  mol.atoms.forEach((atom: { fragment?: number }, id: number) => {
    if (selectedAtoms.has(id)) return;
    const fid = atom.fragment;
    if (fid == null) return;
    let list = byFrag.get(fid);
    if (!list) {
      list = [];
      byFrag.set(fid, list);
    }
    list.push(id);
  });
  const out: Bounds[] = [];
  for (const ids of byFrag.values()) {
    const b = boundsFromAtoms(mol, ids);
    if (b) out.push(b);
  }
  return out;
}

function ensureGuideLayer(host: HTMLElement): SVGSVGElement {
  let svg = host.querySelector('svg.ba-ketcher-align-guides') as SVGSVGElement | null;
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('ba-ketcher-align-guides');
    svg.setAttribute('aria-hidden', 'true');
    Object.assign(svg.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '30',
      overflow: 'visible',
    });
    host.appendChild(svg);
  }
  return svg;
}

function clearGuides(host: HTMLElement): void {
  const svg = host.querySelector('svg.ba-ketcher-align-guides');
  if (svg) svg.innerHTML = '';
}

function drawGuides(host: HTMLElement, editor: EditorLike, guides: AlignGuide[]): void {
  const svg = ensureGuideLayer(host);
  svg.innerHTML = '';
  const render = editor.render;
  if (!render || !guides.length) return;

  const hostRect = host.getBoundingClientRect();

  for (const g of guides) {
    const modelToClient = (mx: number, my: number) => {
      const v = CoordinateTransformation.modelToView(new Vec2(mx, my), render);
      const area = render.clientArea?.getBoundingClientRect?.();
      if (area) {
        return { x: area.left - hostRect.left + v.x, y: area.top - hostRect.top + v.y };
      }
      return { x: v.x, y: v.y };
    };

    let x1: number;
    let y1: number;
    let x2: number;
    let y2: number;
    if (g.axis === 'x') {
      const a = modelToClient(g.pos, g.from);
      const b = modelToClient(g.pos, g.to);
      x1 = a.x;
      y1 = a.y;
      x2 = b.x;
      y2 = b.y;
    } else {
      const a = modelToClient(g.from, g.pos);
      const b = modelToClient(g.to, g.pos);
      x1 = a.x;
      y1 = a.y;
      x2 = b.x;
      y2 = b.y;
    }

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('stroke', g.locked ? '#ff2d8a' : 'rgba(255, 45, 138, 0.75)');
    line.setAttribute('stroke-width', g.locked ? '1.5' : '1');
    if (!g.locked) line.setAttribute('stroke-dasharray', '4 3');
    line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);
  }
}

function kill(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

/**
 * Install selection drag-move with optional alignment snap on the Ketcher host.
 * Returns dispose().
 */
export function installKetcherStructureMove(
  host: HTMLElement,
  getKetcher: () => KetcherLike | null | undefined,
): () => void {
  type DragState = {
    xy0: { x: number; y: number };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    action: any;
    atomSet: Set<number>;
  };

  let drag: DragState | null = null;

  const endDrag = (commit: boolean) => {
    if (!drag) return;
    const editor = getEditor(getKetcher());
    const action = drag.action;
    drag = null;
    clearGuides(host);
    if (!editor || !action) return;
    try {
      if (commit) {
        editor.update(action);
      } else {
        action.perform(editor.render.ctab);
        editor.render.update(false);
      }
    } catch (err) {
      console.warn('[ChemStudio] structure move end failed', err);
    }
  };

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
    const ketcher = getKetcher();
    const editor = getEditor(ketcher);
    // Prefer select tool, but still allow move if something is selected
    if (!editor || !hasSelection(editor)) return;
    if (!isSelectTool(editor)) {
      // If another tool is active, only move when pointer is clearly on selection
      // and we can take over — still require select-like interaction for safety
    }

    try {
      const hit = editor.findItem?.(
        e,
        ['atoms', 'bonds', 'frags', 'rxnArrows', 'rxnPluses', 'texts', 'sgroups', 'functionalGroups'],
        null,
      );
      if (!isHitOnSelection(editor, hit)) return;

      // Only intercept when Select is active — otherwise bond/atom tools keep priority
      if (!isSelectTool(editor)) return;

      kill(e);
      const model = CoordinateTransformation.pageToModel(e, editor.render);
      drag = {
        xy0: { x: model.x, y: model.y },
        action: null,
        atomSet: selectionAtomSet(editor),
      };
    } catch {
      /* let Ketcher handle */
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!drag) return;
    const editor = getEditor(getKetcher());
    if (!editor) return;
    kill(e);

    try {
      const restruct = editor.render.ctab;
      const model = CoordinateTransformation.pageToModel(e, editor.render);
      let delta = new Vec2(model.x - drag.xy0.x, model.y - drag.xy0.y);

      const base = boundsFromSelection(editor, drag.atomSet);
      if (base && drag.atomSet.size > 0) {
        const predicted: Bounds = {
          left: base.left + delta.x,
          top: base.top + delta.y,
          right: base.right + delta.x,
          bottom: base.bottom + delta.y,
          cx: base.cx + delta.x,
          cy: base.cy + delta.y,
          width: base.width,
          height: base.height,
        };
        const others = getOtherFragmentBounds(editor, drag.atomSet);
        const { dx, dy, guides } = computeAlignSnap(
          predicted,
          others,
          { width: 1, height: 1 },
          {
            snapThreshold: SNAP_MODEL,
            approachThreshold: APPROACH_MODEL,
            preferCenter: true,
            skipArtboard: true,
          },
        );
        if (dx || dy) {
          delta = new Vec2(delta.x + dx, delta.y + dy);
        }
        drawGuides(host, editor, guides);
      } else {
        clearGuides(host);
      }

      if (drag.action) {
        drag.action.perform(restruct);
      }
      // Prefer explicitSelected so arrows/pluses/texts are included
      const expSel =
        (typeof editor.explicitSelected === 'function'
          ? editor.explicitSelected()
          : null) ||
        editor.selection?.() ||
        {};
      drag.action = fromMultipleMove(restruct, expSel, delta);
      editor.update(drag.action, true);
    } catch (err) {
      console.warn('[ChemStudio] structure move failed', err);
    }
  };

  const onMouseUp = (e: MouseEvent) => {
    if (!drag) return;
    kill(e);
    endDrag(true);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && drag) {
      kill(e);
      endDrag(false);
    }
  };

  window.addEventListener('mousedown', onMouseDown, true);
  window.addEventListener('mousemove', onMouseMove, true);
  window.addEventListener('mouseup', onMouseUp, true);
  window.addEventListener('keydown', onKeyDown, true);

  return () => {
    endDrag(false);
    window.removeEventListener('mousedown', onMouseDown, true);
    window.removeEventListener('mousemove', onMouseMove, true);
    window.removeEventListener('mouseup', onMouseUp, true);
    window.removeEventListener('keydown', onKeyDown, true);
    host.querySelector('svg.ba-ketcher-align-guides')?.remove();
  };
}
