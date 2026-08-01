/**
 * Single-structure drag + alignment snap for Chem Studio (Ketcher).
 *
 * - Moves only the currently selected atoms/bonds (one connected structure)
 * - Snaps to nearby structure edges/centers like BioArtist canvas guides
 * - Uses Select tool drag; Hand tool still pans the canvas
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
  const sel = editor.selection?.();
  if (!sel) return false;
  return !!(sel.atoms?.length || sel.bonds?.length);
}

function selectionAtomSet(editor: EditorLike): Set<number> {
  const set = new Set<number>();
  const sel = editor.selection?.() || {};
  for (const id of sel.atoms || []) set.add(id);
  // Include bond endpoints so bbox is complete
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
    // model → page via canvas view
    const modelToClient = (mx: number, my: number) => {
      const v = CoordinateTransformation.modelToView(new Vec2(mx, my), render);
      // modelToView is relative to the client area; map into host
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
 * Install structure-only drag with alignment snap on the Ketcher host.
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
        // Commit to history (action already applied)
        editor.update(action);
      } else {
        // Cancel: invert temporary action
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
    if (!editor || !isSelectTool(editor) || !hasSelection(editor)) return;

    // Only take over if pointer is on the current selection (move that structure only)
    try {
      const hit = editor.findItem?.(e, ['atoms', 'bonds', 'frags'], null);
      if (!hit) return;
      const selAtoms = selectionAtomSet(editor);
      const mol = editor.render.ctab.molecule;
      let onSelection = false;
      if (hit.map === 'atoms' && selAtoms.has(hit.id)) onSelection = true;
      if (hit.map === 'bonds') {
        const b = mol.bonds.get(hit.id);
        if (b && (selAtoms.has(b.begin) || selAtoms.has(b.end))) onSelection = true;
      }
      if (hit.map === 'frags') {
        mol.atoms.forEach((atom: { fragment?: number }, id: number) => {
          if (atom.fragment === hit.id && selAtoms.has(id)) onSelection = true;
        });
      }
      if (!onSelection) return;

      // Intercept so Ketcher does not start a multi-item / hand-style drag
      kill(e);
      const model = CoordinateTransformation.pageToModel(e, editor.render);
      drag = {
        xy0: { x: model.x, y: model.y },
        action: null,
        atomSet: selAtoms,
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
      const mol = restruct.molecule;
      const model = CoordinateTransformation.pageToModel(e, editor.render);
      let delta = new Vec2(model.x - drag.xy0.x, model.y - drag.xy0.y);

      // Predicted bounds after unsnapped move
      const base = boundsFromAtoms(mol, drag.atomSet);
      if (base) {
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
        // Snap to other structures: edges AND centers (prefer center–center).
        // No artboard — sketcher has no page frame.
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
      }

      // Invert previous temporary action, apply full delta from origin
      if (drag.action) {
        drag.action.perform(restruct);
      }
      const expSel = editor.explicitSelected?.() || editor.selection?.() || {};
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
