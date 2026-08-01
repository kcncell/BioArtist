/**
 * Chem Studio selection layer on top of Ketcher:
 * - Structure select by default (click molecule / its interior → whole connected component)
 * - Hover previews the same target that a click would select
 * - ⌘/Ctrl + drag → rectangle marquee **from any tool** (bond/atom/etc.)
 *
 * Ketcher binds mousedown/mousemove/mouseup (not pointer events), so we intercept
 * those in the capture phase with stopImmediatePropagation for the marquee gesture.
 */
import { CoordinateTransformation } from 'ketcher-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KetcherLike = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorLike = any;

const DRAG_THRESHOLD_PX = 4;
const BBOX_PAD_MODEL = 0.35;

function isMod(e: MouseEvent | PointerEvent | KeyboardEvent): boolean {
  return !!(e.metaKey || e.ctrlKey);
}

function isSelectTool(editor: EditorLike): boolean {
  try {
    const t = editor.tool?.();
    return !!(t && typeof t.isSelectionRunning === 'function');
  } catch {
    return false;
  }
}

function getEditor(ketcher: KetcherLike): EditorLike | null {
  return ketcher?.editor ?? null;
}

/** Connected-component (fragment) id for an atom or bond hit. */
function fragmentIdFromHit(editor: EditorLike, hit: { map: string; id: number } | null): number | null {
  if (!hit) return null;
  const mol = editor.render?.ctab?.molecule;
  if (!mol) return null;
  if (hit.map === 'frags') return hit.id;
  if (hit.map === 'atoms') {
    const atom = mol.atoms.get(hit.id);
    return atom != null && atom.fragment != null ? atom.fragment : null;
  }
  if (hit.map === 'bonds') {
    const bond = mol.bonds.get(hit.id);
    if (!bond) return null;
    const atom = mol.atoms.get(bond.begin);
    return atom != null && atom.fragment != null ? atom.fragment : null;
  }
  return null;
}

/** Prefer atom/bond/frag under cursor; fall back to fragment bbox (center of structure). */
function resolveFragmentUnderPointer(editor: EditorLike, event: MouseEvent): number | null {
  try {
    const hit = editor.findItem?.(
      event,
      ['atoms', 'bonds', 'frags', 'sgroups', 'functionalGroups'],
      null,
    );
    const fromHit = fragmentIdFromHit(editor, hit);
    if (fromHit != null) return fromHit;

    const render = editor.render;
    const restruct = render?.ctab;
    if (!render || !restruct?.frags) return null;

    const pos = CoordinateTransformation.pageToModel(event, render);
    let bestId: number | null = null;
    let bestArea = Number.POSITIVE_INFINITY;

    restruct.frags.forEach(
      (
        refrag: {
          calcBBox?: (
            r: unknown,
            id: number,
            rnd: unknown,
          ) => { contains: (p: unknown, ext?: number) => boolean; sz: () => { x: number; y: number } } | undefined;
        },
        fid: number,
      ) => {
        if (!refrag?.calcBBox) return;
        const bbox = refrag.calcBBox(restruct, fid, render);
        if (!bbox?.contains?.(pos, BBOX_PAD_MODEL)) return;
        const sz = bbox.sz();
        const area = Math.abs(sz.x * sz.y) || 0;
        if (area < bestArea) {
          bestArea = area;
          bestId = fid;
        }
      },
    );

    return bestId;
  } catch {
    return null;
  }
}

function selectFragment(editor: EditorLike, fragId: number): void {
  try {
    const ctab = editor.render.ctab;
    const refrag = ctab.frags.get(fragId);
    if (!refrag) return;
    const atoms: number[] =
      typeof refrag.fragGetAtoms === 'function' ? refrag.fragGetAtoms(ctab, fragId) : [];
    const bonds: number[] =
      typeof refrag.fragGetBonds === 'function' ? refrag.fragGetBonds(ctab, fragId) : [];
    editor.selection({ atoms, bonds });
  } catch (err) {
    console.warn('[ChemStudio] selectFragment failed', err);
  }
}

function hoverFragment(editor: EditorLike, fragId: number | null, event?: MouseEvent): void {
  try {
    if (fragId == null) {
      editor.hover?.(null);
      return;
    }
    editor.hover?.({ map: 'frags', id: fragId }, null, event);
  } catch {
    /* ignore */
  }
}

function selectionInModelRect(
  editor: EditorLike,
  a: { x: number; y: number },
  b: { x: number; y: number },
): { atoms: number[]; bonds: number[] } {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const mol = editor.render.ctab.molecule;
  const atoms: number[] = [];
  const atomSet = new Set<number>();

  mol.atoms.forEach((atom: { pp: { x: number; y: number } }, id: number) => {
    const { x, y } = atom.pp;
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
      atoms.push(id);
      atomSet.add(id);
    }
  });

  const bonds: number[] = [];
  mol.bonds.forEach((bond: { begin: number; end: number }, id: number) => {
    if (atomSet.has(bond.begin) && atomSet.has(bond.end)) {
      bonds.push(id);
    }
  });

  return { atoms, bonds };
}

function ensureMarqueeEl(): HTMLDivElement {
  let el = document.querySelector('.ba-ketcher-marquee') as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.className = 'ba-ketcher-marquee';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  return el;
}

function placeMarquee(el: HTMLDivElement, x0: number, y0: number, x1: number, y1: number): void {
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  el.style.display = 'block';
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.width = `${Math.abs(x1 - x0)}px`;
  el.style.height = `${Math.abs(y1 - y0)}px`;
}

function hideMarquee(el: HTMLDivElement | null): void {
  if (el) el.style.display = 'none';
}

/** Kill event so Ketcher (and other handlers) never see this gesture. */
function killEvent(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

/** Activate structure-select mode (click molecule → whole connected component). */
export function activateStructureSelect(ketcher: KetcherLike): void {
  try {
    const editor = getEditor(ketcher);
    if (!editor || typeof editor.tool !== 'function') return;
    editor.tool('select', 'fragment');
  } catch (err) {
    console.warn('[ChemStudio] activateStructureSelect failed', err);
  }
}

export type SelectionEnhanceHandle = {
  reassertDefaultTool: () => void;
  dispose: () => void;
};

/**
 * Install hover preview, structure-click, and ⌘/Ctrl marquee on the Ketcher host root.
 * Marquee works from **any** active tool.
 */
export function installKetcherSelectionEnhance(
  root: HTMLElement,
  getKetcher: () => KetcherLike | null | undefined,
): SelectionEnhanceHandle {
  let lastHoverFrag: number | null = null;
  let marqueeEl: HTMLDivElement | null = null;
  let marquee: {
    clientX0: number;
    clientY0: number;
    model0: { x: number; y: number };
    active: boolean;
    additive: boolean;
  } | null = null;

  const reassertDefaultTool = () => {
    const k = getKetcher();
    if (k) activateStructureSelect(k);
  };

  const endMarquee = (event: MouseEvent | null, commit: boolean) => {
    if (!marquee) return;
    const editor = getEditor(getKetcher());
    const state = marquee;
    marquee = null;
    hideMarquee(marqueeEl);
    document.body.classList.remove('ba-ketcher-marquee-active');

    if (!commit || !editor || !event) return;

    if (!state.active) {
      // ⌘+click without drag: select structure under cursor if any
      const fragId = resolveFragmentUnderPointer(editor, event);
      if (fragId != null) selectFragment(editor, fragId);
      return;
    }

    try {
      const model1 = CoordinateTransformation.pageToModel(event, editor.render);
      const sel = selectionInModelRect(editor, state.model0, model1);
      if (state.additive && editor.selection()) {
        const prev = editor.selection() || {};
        const atomSet = new Set<number>([...(prev.atoms || []), ...sel.atoms]);
        const bondSet = new Set<number>([...(prev.bonds || []), ...sel.bonds]);
        editor.selection({ atoms: [...atomSet], bonds: [...bondSet] });
      } else {
        editor.selection(sel.atoms.length || sel.bonds.length ? sel : null);
      }
    } catch (err) {
      console.warn('[ChemStudio] marquee select failed', err);
    }
  };

  /**
   * ⌘/Ctrl + mousedown → start marquee from **any** tool.
   * Must use mouse events (Ketcher does) and capture + stopImmediatePropagation
   * so bond/atom tools never receive the gesture.
   */
  const onMouseDownCapture = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (!isMod(e)) return;

    const editor = getEditor(getKetcher());
    if (!editor?.render) return;

    // Only when the event is inside our Ketcher host (root or a descendant)
    const target = e.target as Node | null;
    if (!target || !root.contains(target)) return;

    killEvent(e);

    try {
      const model0 = CoordinateTransformation.pageToModel(e, editor.render);
      marqueeEl = ensureMarqueeEl();
      marquee = {
        clientX0: e.clientX,
        clientY0: e.clientY,
        model0: { x: model0.x, y: model0.y },
        active: false,
        additive: e.shiftKey,
      };
      document.body.classList.add('ba-ketcher-marquee-active');
      try {
        editor.hover?.(null);
      } catch {
        /* */
      }
      lastHoverFrag = null;
    } catch (err) {
      console.warn('[ChemStudio] marquee start failed', err);
      marquee = null;
      document.body.classList.remove('ba-ketcher-marquee-active');
    }
  };

  const onMouseMoveCapture = (e: MouseEvent) => {
    if (marquee) {
      killEvent(e);
      const dx = e.clientX - marquee.clientX0;
      const dy = e.clientY - marquee.clientY0;
      if (!marquee.active && (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX)) {
        marquee.active = true;
      }
      if (marquee.active) {
        marqueeEl = marqueeEl || ensureMarqueeEl();
        placeMarquee(marqueeEl, marquee.clientX0, marquee.clientY0, e.clientX, e.clientY);
      }
      return;
    }

    // Hover preview only while a select tool is active (don't fight bond tools)
    if (e.buttons !== 0) return;
    const editor = getEditor(getKetcher());
    if (!editor) return;
    if (!isSelectTool(editor)) {
      if (lastHoverFrag != null) {
        hoverFragment(editor, null);
        lastHoverFrag = null;
      }
      return;
    }

    try {
      const fragId = resolveFragmentUnderPointer(editor, e);
      if (fragId === lastHoverFrag) {
        if (fragId != null) hoverFragment(editor, fragId, e);
        return;
      }
      lastHoverFrag = fragId;
      hoverFragment(editor, fragId, e);
    } catch {
      /* ignore */
    }
  };

  const onMouseUpCapture = (e: MouseEvent) => {
    if (!marquee) return;
    killEvent(e);
    endMarquee(e, true);
  };

  const onMouseDownBubble = (e: MouseEvent) => {
    // Structure-click enhance: only when select tool is active and not ⌘-marquee
    if (e.button !== 0 || isMod(e)) return;
    const editor = getEditor(getKetcher());
    if (!editor || !isSelectTool(editor)) return;

    try {
      const near = editor.findItem?.(
        e,
        ['atoms', 'bonds', 'frags', 'sgroups', 'functionalGroups', 'rgroups', 'texts'],
        null,
      );
      const fragId = resolveFragmentUnderPointer(editor, e);
      if (fragId == null) return;

      hoverFragment(editor, null);
      lastHoverFrag = null;

      if (e.shiftKey) {
        const ctab = editor.render.ctab;
        const refrag = ctab.frags.get(fragId);
        const atoms: number[] = refrag?.fragGetAtoms?.(ctab, fragId) || [];
        const bonds: number[] = refrag?.fragGetBonds?.(ctab, fragId) || [];
        const prev = editor.selection() || {};
        editor.selection({
          atoms: [...new Set([...(prev.atoms || []), ...atoms])],
          bonds: [...new Set([...(prev.bonds || []), ...bonds])],
        });
      } else {
        selectFragment(editor, fragId);
      }

      // Interior/center hit: block Ketcher blank-canvas clear
      if (!near) {
        killEvent(e);
      }
    } catch {
      /* let Ketcher handle */
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (marquee) {
        killEvent(e);
        endMarquee(null, false);
      }
    }
  };

  const onBlur = () => {
    if (marquee) endMarquee(null, false);
  };

  // Capture on window so we always win over Ketcher's clientArea/document listeners
  // for the ⌘/Ctrl marquee gesture, regardless of active tool.
  window.addEventListener('mousedown', onMouseDownCapture, true);
  window.addEventListener('mousemove', onMouseMoveCapture, true);
  window.addEventListener('mouseup', onMouseUpCapture, true);
  // Structure-click: capture on root so we run before Ketcher's target handler
  root.addEventListener('mousedown', onMouseDownBubble, true);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('blur', onBlur);

  return {
    reassertDefaultTool,
    dispose: () => {
      endMarquee(null, false);
      window.removeEventListener('mousedown', onMouseDownCapture, true);
      window.removeEventListener('mousemove', onMouseMoveCapture, true);
      window.removeEventListener('mouseup', onMouseUpCapture, true);
      root.removeEventListener('mousedown', onMouseDownBubble, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onBlur);
      marqueeEl?.remove();
      marqueeEl = null;
      document.body.classList.remove('ba-ketcher-marquee-active');
    },
  };
}
