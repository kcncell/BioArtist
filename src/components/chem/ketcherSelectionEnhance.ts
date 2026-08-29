/**
 * Chem Studio selection layer on top of Ketcher:
 * - Structure select by default (click molecule / its interior → whole connected component)
 * - Hover previews the same target that a click would select
 * - Plain left-drag → rectangle marquee from almost any tool (including Rectangle select
 *   and Structure select), starting on blank canvas **or** on a structure
 * - Exceptions: eraser and bond/chain drawing tools keep native drag (draw / erase)
 * - ⌘/Ctrl + drag → marquee from **any** tool (including eraser / bond)
 * - Drag on an existing selection while Select is active → structure move (not marquee)
 *
 * Ketcher binds mousedown/mousemove/mouseup (not pointer events), so we intercept
 * those in the capture phase with stopImmediatePropagation for the marquee gesture.
 */
import { CoordinateTransformation } from 'ketcher-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KetcherLike = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorLike = any;

type SelectMode = 'fragment' | 'rectangle' | 'lasso' | string;

type LastTool = { name: string; opts?: unknown };

const DRAG_THRESHOLD_PX = 4;
const BBOX_PAD_MODEL = 0.35;

/** Last select sub-mode per editor (SelectTool keeps mode in a private field). */
const selectModeByEditor = new WeakMap<object, SelectMode>();
/** Last tool('name', opts) so we can re-activate after structure mutations. */
const lastToolByEditor = new WeakMap<object, LastTool>();
const toolWrappedEditors = new WeakSet<object>();

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

/**
 * Wrap editor.tool so we know:
 * - fragment vs rectangle/lasso select mode
 * - the last active tool (eraser, bond, select-rectangle, …) for re-activation after add
 *
 * Must run before the user can switch tools (see bindEditor / activateStructureSelect).
 */
function ensureSelectModeTracking(editor: EditorLike): void {
  if (!editor || typeof editor.tool !== 'function' || toolWrappedEditors.has(editor)) return;
  toolWrappedEditors.add(editor);
  const orig = editor.tool.bind(editor);
  editor.tool = function trackedTool(name?: unknown, opts?: unknown) {
    if (arguments.length === 0) {
      return orig();
    }
    if (typeof name === 'string') {
      lastToolByEditor.set(editor, { name, opts });
      if (name === 'select') {
        const mode = typeof opts === 'string' ? opts : 'fragment';
        selectModeByEditor.set(editor, mode);
      }
    }
    return orig(name, opts);
  };
}

function getSelectMode(editor: EditorLike): SelectMode | null {
  try {
    ensureSelectModeTracking(editor);
    if (selectModeByEditor.has(editor)) {
      return selectModeByEditor.get(editor) ?? null;
    }
    // Public mode on some tool variants (e.g. view-only)
    const t = editor.tool?.();
    if (t && typeof t.mode === 'string') return t.mode as SelectMode;
    if (t?.lassoHelper && typeof t.lassoHelper.fragment === 'boolean') {
      return t.lassoHelper.fragment ? 'fragment' : 'rectangle';
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Rectangle or freeform lasso select sub-mode. */
function isAreaSelectMode(editor: EditorLike): boolean {
  if (!isSelectTool(editor)) return false;
  const mode = getSelectMode(editor);
  return mode === 'rectangle' || mode === 'lasso';
}

function getLastToolName(editor: EditorLike): string {
  ensureSelectModeTracking(editor);
  return lastToolByEditor.get(editor)?.name ?? '';
}

/**
 * Tools that need native left-drag (do not steal for marquee unless ⌘/Ctrl).
 * - eraser: drag-erase
 * - bond / chain: drag to draw bonds / carbon chains ("multiple bond buttons")
 */
function blocksPlainMarquee(editor: EditorLike): boolean {
  const name = getLastToolName(editor);
  return name === 'eraser' || name === 'erase' || name === 'bond' || name === 'chain';
}

/** True when pointer is over a drawable structure item (not blank canvas). */
function hitStructureItem(editor: EditorLike, event: MouseEvent): boolean {
  try {
    const hit = editor.findItem?.(
      event,
      ['atoms', 'bonds', 'frags', 'sgroups', 'functionalGroups', 'rgroups', 'texts', 'rxnArrows', 'rxnPluses'],
      null,
    );
    return !!hit;
  } catch {
    return false;
  }
}

function selectionHasAnything(sel: {
  atoms?: number[];
  bonds?: number[];
  rxnArrows?: number[];
  rxnPluses?: number[];
  texts?: number[];
  simpleObjects?: number[];
} | null): boolean {
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

/** True when pointer is on the current selection (atoms, arrows, pluses, texts, …). */
function isPointerOnSelection(editor: EditorLike, event: MouseEvent): boolean {
  try {
    const sel = editor.selection?.();
    if (!selectionHasAnything(sel)) return false;
    const atomSet = new Set<number>(sel.atoms || []);
    const bondSet = new Set<number>(sel.bonds || []);
    const arrowSet = new Set<number>(sel.rxnArrows || []);
    const plusSet = new Set<number>(sel.rxnPluses || []);
    const textSet = new Set<number>(sel.texts || []);

    const hit = editor.findItem?.(
      event,
      ['atoms', 'bonds', 'frags', 'sgroups', 'functionalGroups', 'rxnArrows', 'rxnPluses', 'texts'],
      null,
    );
    if (!hit) return false;
    if (hit.map === 'atoms' && atomSet.has(hit.id)) return true;
    if (hit.map === 'bonds' && bondSet.has(hit.id)) return true;
    if (hit.map === 'rxnArrows' && arrowSet.has(hit.id)) return true;
    if (hit.map === 'rxnPluses' && plusSet.has(hit.id)) return true;
    if (hit.map === 'texts' && textSet.has(hit.id)) return true;
    if (hit.map === 'frags') {
      const mol = editor.render?.ctab?.molecule;
      const ctab = editor.render?.ctab;
      const refrag = ctab?.frags?.get?.(hit.id);
      const atoms: number[] = refrag?.fragGetAtoms?.(ctab, hit.id) || [];
      if (atoms.some((id) => atomSet.has(id))) return true;
      if (mol?.atoms) {
        let found = false;
        mol.atoms.forEach((atom: { fragment?: number }, id: number) => {
          if (!found && atomSet.has(id) && atom.fragment === hit.id) found = true;
        });
        if (found) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** Click-select a single arrow / plus / text / fragment under the pointer. */
function selectItemUnderPointer(
  editor: EditorLike,
  event: MouseEvent,
  additive: boolean,
): boolean {
  try {
    const hit = editor.findItem?.(
      event,
      ['atoms', 'bonds', 'frags', 'sgroups', 'functionalGroups', 'rxnArrows', 'rxnPluses', 'texts'],
      null,
    );
    if (!hit) return false;

    const prev = additive ? editor.selection() || {} : {};
    if (hit.map === 'rxnArrows') {
      editor.selection({
        ...(additive ? prev : {}),
        rxnArrows: additive
          ? [...new Set([...(prev.rxnArrows || []), hit.id])]
          : [hit.id],
      });
      return true;
    }
    if (hit.map === 'rxnPluses') {
      editor.selection({
        ...(additive ? prev : {}),
        rxnPluses: additive
          ? [...new Set([...(prev.rxnPluses || []), hit.id])]
          : [hit.id],
      });
      return true;
    }
    if (hit.map === 'texts') {
      editor.selection({
        ...(additive ? prev : {}),
        texts: additive ? [...new Set([...(prev.texts || []), hit.id])] : [hit.id],
      });
      return true;
    }

    const fragId = fragmentIdFromHit(editor, hit) ?? resolveFragmentUnderPointer(editor, event);
    if (fragId == null) return false;
    if (additive) {
      const ctab = editor.render.ctab;
      const refrag = ctab.frags.get(fragId);
      const atoms: number[] = refrag?.fragGetAtoms?.(ctab, fragId) || [];
      const bonds: number[] = refrag?.fragGetBonds?.(ctab, fragId) || [];
      editor.selection({
        atoms: [...new Set([...(prev.atoms || []), ...atoms])],
        bonds: [...new Set([...(prev.bonds || []), ...bonds])],
        rxnArrows: prev.rxnArrows || [],
        rxnPluses: prev.rxnPluses || [],
        texts: prev.texts || [],
      });
    } else {
      selectFragment(editor, fragId);
    }
    return true;
  } catch {
    return false;
  }
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

function pointInRect(
  x: number,
  y: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): boolean {
  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

function selectionInModelRect(
  editor: EditorLike,
  a: { x: number; y: number },
  b: { x: number; y: number },
): {
  atoms: number[];
  bonds: number[];
  rxnArrows?: number[];
  rxnPluses?: number[];
  texts?: number[];
} {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const mol = editor.render.ctab.molecule;
  const atoms: number[] = [];
  const atomSet = new Set<number>();

  mol.atoms.forEach((atom: { pp: { x: number; y: number } }, id: number) => {
    const { x, y } = atom.pp;
    if (pointInRect(x, y, minX, maxX, minY, maxY)) {
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

  const rxnArrows: number[] = [];
  try {
    mol.rxnArrows?.forEach?.(
      (arrow: { pos?: Array<{ x: number; y: number }>; center?: () => { x: number; y: number } }, id: number) => {
        const pts = arrow.pos || [];
        const hit =
          pts.some((p) => pointInRect(p.x, p.y, minX, maxX, minY, maxY)) ||
          (typeof arrow.center === 'function' &&
            (() => {
              const c = arrow.center!();
              return pointInRect(c.x, c.y, minX, maxX, minY, maxY);
            })());
        if (hit) rxnArrows.push(id);
      },
    );
  } catch {
    /* optional */
  }

  const rxnPluses: number[] = [];
  try {
    mol.rxnPluses?.forEach?.(
      (plus: { pp?: { x: number; y: number } }, id: number) => {
        if (plus.pp && pointInRect(plus.pp.x, plus.pp.y, minX, maxX, minY, maxY)) {
          rxnPluses.push(id);
        }
      },
    );
  } catch {
    /* optional */
  }

  const texts: number[] = [];
  try {
    mol.texts?.forEach?.(
      (text: { position?: { x: number; y: number }; pos?: Array<{ x: number; y: number }> }, id: number) => {
        const p = text.position || text.pos?.[0];
        if (p && pointInRect(p.x, p.y, minX, maxX, minY, maxY)) texts.push(id);
      },
    );
  } catch {
    /* optional */
  }

  return {
    atoms,
    bonds,
    ...(rxnArrows.length ? { rxnArrows } : {}),
    ...(rxnPluses.length ? { rxnPluses } : {}),
    ...(texts.length ? { texts } : {}),
  };
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
    ensureSelectModeTracking(editor);
    editor.tool('select', 'fragment');
  } catch (err) {
    console.warn('[ChemStudio] activateStructureSelect failed', err);
  }
}

/**
 * Re-activate whatever tool the user last chose (rectangle, eraser, bond, …).
 * Use after adding structures so toolbar selection stays effective without re-clicking.
 */
export function reassertLastTool(ketcher: KetcherLike): void {
  try {
    const editor = getEditor(ketcher);
    if (!editor || typeof editor.tool !== 'function') return;
    ensureSelectModeTracking(editor);
    const last = lastToolByEditor.get(editor);
    if (!last?.name) return;
    editor.tool(last.name, last.opts);
  } catch (err) {
    console.warn('[ChemStudio] reassertLastTool failed', err);
  }
}

export type SelectionEnhanceHandle = {
  reassertDefaultTool: () => void;
  /** Re-apply the tool currently shown in the toolbar (not forced structure-select). */
  reassertLastTool: () => void;
  /** Call as soon as Ketcher is ready so tool('select', mode) is tracked. */
  bindEditor: (ketcher: KetcherLike) => void;
  dispose: () => void;
};

/**
 * Install hover preview, structure-click, and marquee on the Ketcher host root.
 * - Plain left-drag marquee from most tools (see blocksPlainMarquee)
 * - ⌘/Ctrl+drag marquee from **any** tool
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
    /** true when gesture started with ⌘/Ctrl (any tool) */
    fromMod: boolean;
    /** Tool name when the gesture began (for click-replay). */
    toolName: string;
  } | null = null;

  const bindEditor = (ketcher: KetcherLike) => {
    const editor = getEditor(ketcher);
    if (editor) ensureSelectModeTracking(editor);
  };

  const reassertDefaultTool = () => {
    const k = getKetcher();
    if (k) activateStructureSelect(k);
  };

  const reassertLastToolHandle = () => {
    const k = getKetcher();
    if (k) reassertLastTool(k);
  };

  const beginMarquee = (e: MouseEvent, editor: EditorLike, fromMod: boolean) => {
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
        fromMod,
        toolName: getLastToolName(editor),
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

  /** Replay a simple click into the active tool (atom place, etc.) after a no-drag gesture. */
  const replayToolClick = (editor: EditorLike, event: MouseEvent) => {
    try {
      const tool = editor.tool?.();
      if (!tool) return;
      if (typeof tool.mousedown === 'function') tool.mousedown(event);
      if (typeof tool.mouseup === 'function') tool.mouseup(event);
      else if (typeof tool.click === 'function') tool.click(event);
    } catch (err) {
      console.warn('[ChemStudio] tool click replay failed', err);
    }
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
      // Click without drag — select molecule / arrow / plus / text under cursor
      if (state.fromMod) {
        selectItemUnderPointer(editor, event, false);
        return;
      }

      const onSelect = isSelectTool(editor) || state.toolName === 'select';
      if (onSelect) {
        const selected = selectItemUnderPointer(editor, event, state.additive);
        if (!selected && !state.additive) {
          try {
            editor.selection(null);
          } catch {
            /* ignore */
          }
        }
        return;
      }

      // Non-select tool (atom, charge, …): we stole mousedown — replay click
      replayToolClick(editor, event);
      return;
    }

    try {
      const model1 = CoordinateTransformation.pageToModel(event, editor.render);
      const sel = selectionInModelRect(editor, state.model0, model1);
      const hasAny =
        sel.atoms.length ||
        sel.bonds.length ||
        sel.rxnArrows?.length ||
        sel.rxnPluses?.length ||
        sel.texts?.length;
      if (state.additive && editor.selection()) {
        const prev = editor.selection() || {};
        editor.selection({
          atoms: [...new Set([...(prev.atoms || []), ...sel.atoms])],
          bonds: [...new Set([...(prev.bonds || []), ...sel.bonds])],
          rxnArrows: [
            ...new Set([...(prev.rxnArrows || []), ...(sel.rxnArrows || [])]),
          ],
          rxnPluses: [
            ...new Set([...(prev.rxnPluses || []), ...(sel.rxnPluses || [])]),
          ],
          texts: [...new Set([...(prev.texts || []), ...(sel.texts || [])])],
        });
      } else {
        editor.selection(hasAny ? sel : null);
      }
    } catch (err) {
      console.warn('[ChemStudio] marquee select failed', err);
    }
  };

  /**
   * Start marquee when:
   * - ⌘/Ctrl + mousedown from **any** tool, or
   * - plain left mousedown from any tool except eraser / bond / chain
   *   (and except drag-on-selection while Select is active → structure move)
   *
   * Capture + stopImmediatePropagation so native tools do not steal the gesture.
   */
  const onMouseDownCapture = (e: MouseEvent) => {
    if (e.button !== 0) return;

    const ketcher = getKetcher();
    const editor = getEditor(ketcher);
    if (!editor?.render) return;
    ensureSelectModeTracking(editor);

    // Only when the event is inside our Ketcher host (root or a descendant)
    const target = e.target as Node | null;
    if (!target || !root.contains(target)) return;

    const mod = isMod(e);
    if (mod) {
      // ⌘/Ctrl+drag marquee regardless of active tool
      beginMarquee(e, editor, true);
      return;
    }

    // Eraser + bond/chain keep native left-drag
    if (blocksPlainMarquee(editor)) return;

    // Already-selected item under cursor → let structure-move drag it
    // (molecules, reaction arrows, pluses, text labels)
    if (isPointerOnSelection(editor, e)) return;

    // Empty canvas (or unselected area) → rectangle marquee
    beginMarquee(e, editor, false);
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

    // Hover preview only in structure-select (fragment) mode — not while area-selecting
    if (e.buttons !== 0) return;
    const editor = getEditor(getKetcher());
    if (!editor) return;
    ensureSelectModeTracking(editor);
    if (!isSelectTool(editor) || isAreaSelectMode(editor)) {
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
    // Structure-click enhance: fragment select mode only (not rectangle marquee tool)
    if (e.button !== 0 || isMod(e)) return;
    const editor = getEditor(getKetcher());
    if (!editor || !isSelectTool(editor)) return;
    ensureSelectModeTracking(editor);
    if (isAreaSelectMode(editor)) return;

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
  // for the marquee gesture, regardless of active tool (⌘ path) or in area-select mode.
  window.addEventListener('mousedown', onMouseDownCapture, true);
  window.addEventListener('mousemove', onMouseMoveCapture, true);
  window.addEventListener('mouseup', onMouseUpCapture, true);
  // Structure-click: capture on root so we run before Ketcher's target handler
  root.addEventListener('mousedown', onMouseDownBubble, true);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('blur', onBlur);

  // If ketcher already exists, start tracking immediately
  try {
    const ed = getEditor(getKetcher());
    if (ed) ensureSelectModeTracking(ed);
  } catch {
    /* ignore */
  }

  return {
    reassertDefaultTool,
    reassertLastTool: reassertLastToolHandle,
    bindEditor,
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
