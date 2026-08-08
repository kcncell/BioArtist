import {
  ActiveSelection,
  Canvas,
  Circle,
  Ellipse,
  FabricImage,
  FabricObject,
  Group,
  IText,
  Line,
  Path,
  Point,
  Polygon,
  Polyline,
  Rect,
  Textbox,
  Triangle,
  loadSVGFromString,
  util,
  type TMat2D,
} from 'fabric';
import type { LayerInfo, LineKind, SelectionProps, ShapeKind } from '../types';
import type { BaObject } from '../types';
import {
  bindAlignGuideHandlers,
  clearAlignGuides,
  resetAlignGuideHandlers,
} from './alignGuides';
import {
  enterCropMode as enterCropModeImpl,
  exitCropMode as exitCropModeImpl,
  installCropControls,
  isCropModeActive as isCropModeActiveImpl,
  isCroppable,
  resetCrop,
} from './imageCrop';

// Persist BioArtist metadata across save/load and history
FabricObject.customProperties = [
  'baId',
  'baName',
  'baLocked',
  'baReactionId',
  'baReagentSlot',
  'baTextBox',
  'baMinHeight',
  'baCrop',
  'baCropMode',
];

/**
 * Fabric Textbox uses `stroke` for glyph outlines, not a rectangular border.
 * For BioArtist text boxes we repurpose stroke/strokeWidth as a box border and
 * keep `backgroundColor` as the box fill (Object._renderBackground already does).
 */
function isBaTextBox(obj: FabricObject): boolean {
  return !!(obj as FabricObject & { baTextBox?: boolean }).baTextBox;
}

function isNoneStroke(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v !== 'string') return false;
  const s = v.trim().toLowerCase();
  return s === '' || s === 'none' || s === 'transparent' || s === 'rgba(0,0,0,0)' || s === 'rgba(0, 0, 0, 0)';
}

// Patch once — survives loadFromJSON as long as baTextBox is restored via customProperties.
const _textboxRender = Textbox.prototype._render;
Textbox.prototype._render = function (this: Textbox, ctx: CanvasRenderingContext2D) {
  if (isBaTextBox(this)) {
    const sw = this.strokeWidth ?? 0;
    const stroke = this.stroke;
    if (sw > 0 && !isNoneStroke(stroke)) {
      const dim = this._getNonTransformedDimensions();
      ctx.save();
      ctx.strokeStyle = stroke as string;
      ctx.lineWidth = sw;
      ctx.lineJoin = 'miter';
      ctx.setLineDash([]);
      // Centered stroke around the text box bounds
      ctx.strokeRect(-dim.x / 2, -dim.y / 2, dim.x, dim.y);
      ctx.restore();
    }
    // Suppress glyph outline while drawing text
    const savedStroke = this.stroke;
    const savedSw = this.strokeWidth;
    this.stroke = undefined as unknown as string;
    this.strokeWidth = 0;
    _textboxRender.call(this, ctx);
    this.stroke = savedStroke;
    this.strokeWidth = savedSw;
    return;
  }
  _textboxRender.call(this, ctx);
};

const _textboxInitDimensions = Textbox.prototype.initDimensions;
Textbox.prototype.initDimensions = function (this: Textbox) {
  _textboxInitDimensions.call(this);
  if (!isBaTextBox(this)) return;
  const minH = (this as Textbox & { baMinHeight?: number }).baMinHeight;
  if (typeof minH === 'number' && minH > 0 && (this.height ?? 0) < minH) {
    this.height = minH;
  }
};

let ARTBOARD_W = 900;
let ARTBOARD_H = 600;

let canvas: Canvas | null = null;
let history: string[] = [];
let historyIndex = -1;
let historyLock = false;
/** When true, object:added/removed do not auto-push history (transactional ops). */
let batchMode = false;
/**
 * User zoom (1 = fit-scale only). Fabric viewport stays identity;
 * display zoom + pan use CSS scale + the workspace scroll container.
 */
let userZoom = 1;
/** Scrollable stage area — used for pan / zoom-to-cursor when zoomed in */
let scrollEl: HTMLElement | null = null;
let listeners: {
  onLayers?: () => void;
  onSelection?: () => void;
  onHistory?: (canUndo: boolean, canRedo: boolean) => void;
  onZoom?: (z: number) => void;
  onObjectCount?: (n: number) => void;
} = {};

function uid() {
  return `ba_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function asBa(obj: FabricObject): BaObject {
  return obj as BaObject;
}

function ensureMeta(obj: FabricObject, name?: string) {
  const o = asBa(obj);
  if (!o.baId) o.baId = uid();
  if (!o.baName) o.baName = name || guessName(obj);
  const t = (obj.type || '').toLowerCase();
  const isTextObj = t === 'i-text' || t === 'textbox' || t === 'text';
  o.set({
    borderColor: '#8ec5ff',
    cornerColor: '#1a1c22',
    cornerStrokeColor: '#8ec5ff',
    cornerStyle: 'circle',
    transparentCorners: false,
    borderScaleFactor: 1.5,
    // Textbox.padding is text inset — do not overwrite with control padding
    ...(isTextObj ? {} : { padding: 2 }),
  });
}

function guessName(obj: FabricObject): string {
  const t = (obj.type || 'object').toLowerCase();
  if (t === 'textbox') return 'Text box';
  if (t === 'i-text' || t === 'text') return 'Text';
  if (t === 'rect') return 'Rectangle';
  if (t === 'ellipse' || t === 'circle') return 'Ellipse';
  if (t === 'line') return 'Line';
  if (t === 'group') return 'Group';
  if (t === 'path') return 'Path';
  if (t === 'triangle' || t === 'polygon') return 'Shape';
  if (t === 'activeselection') return 'Selection';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function isActiveSelection(obj: FabricObject | null | undefined): boolean {
  if (!obj) return false;
  const t = (obj.type || '').toLowerCase();
  return t === 'activeselection' || t === 'activeSelection';
}

function isGroup(obj: FabricObject | null | undefined): boolean {
  if (!obj || isActiveSelection(obj)) return false;
  return obj instanceof Group || (obj.type || '').toLowerCase() === 'group';
}

function notifyObjectCount() {
  listeners.onObjectCount?.(canvas?.getObjects().length ?? 0);
}

/**
 * Run a mutation that adds/removes objects without intermediate history entries.
 * Pushes one history snapshot at the end.
 */
function withHistory(fn: () => void) {
  if (!canvas) return;
  batchMode = true;
  try {
    fn();
  } finally {
    batchMode = false;
  }
  listeners.onLayers?.();
  listeners.onSelection?.();
  notifyObjectCount();
  pushHistory();
}

export function initCanvas(el: HTMLCanvasElement): Canvas {
  if (canvas) {
    canvas.dispose();
    canvas = null;
  }

  canvas = new Canvas(el, {
    width: ARTBOARD_W,
    height: ARTBOARD_H,
    backgroundColor: '#ffffff',
    preserveObjectStacking: true,
    selection: true,
    selectionColor: 'rgba(142, 197, 255, 0.12)',
    selectionBorderColor: '#8ec5ff',
    selectionLineWidth: 1,
  });

  canvas.on('selection:created', () => {
    installCropControlsOnSelection();
    listeners.onSelection?.();
  });
  canvas.on('selection:updated', () => {
    installCropControlsOnSelection();
    listeners.onSelection?.();
  });
  canvas.on('selection:cleared', () => {
    // Leaving selection exits dedicated crop mode
    if (isCropModeActive()) exitCropMode();
    listeners.onSelection?.();
  });
  canvas.on('object:modified', () => {
    listeners.onSelection?.();
    listeners.onLayers?.();
    if (!historyLock && !batchMode) pushHistory();
  });
  canvas.on('object:added', (e) => {
    if (e.target && !isActiveSelection(e.target)) {
      ensureMeta(e.target);
      // Corners = reshape, sides = crop for figures / pictures
      if (isCroppable(e.target)) installCropControls(e.target);
    }
    listeners.onLayers?.();
    notifyObjectCount();
    if (!historyLock && !batchMode) pushHistory();
  });
  canvas.on('object:removed', () => {
    listeners.onLayers?.();
    listeners.onSelection?.();
    notifyObjectCount();
    if (!historyLock && !batchMode) pushHistory();
  });
  canvas.on('text:changed', () => {
    listeners.onSelection?.();
    listeners.onLayers?.();
  });

  // Keep fabric’s hidden editing textarea from scrolling/shifting the app chrome
  canvas.on('text:editing:entered', (opt) => {
    const target = (opt as { target?: FabricObject })?.target;
    if (target && (target instanceof IText || target instanceof Textbox)) {
      pinFabricTextarea(target as Textbox | IText);
      // Neutralize any scroll-into-view the browser applied on focus
      try {
        const se = document.scrollingElement;
        if (se) {
          se.scrollLeft = 0;
          se.scrollTop = 0;
        }
        document.documentElement.scrollLeft = 0;
        document.body.scrollLeft = 0;
      } catch {
        /* ignore */
      }
    }
  });

  // Ensure host exists early
  if (typeof document !== 'undefined') getFabricTextareaHost();

  history = [];
  historyIndex = -1;
  pushHistory();
  notifyObjectCount();
  resetAlignGuideHandlers();
  initSnapHandler();
  setSnap(true);

  return canvas;
}

export function disposeCanvas() {
  if (canvas) {
    clearAlignGuides(canvas);
    canvas.dispose();
    canvas = null;
  }
  resetAlignGuideHandlers();
  history = [];
  historyIndex = -1;
}

export function getCanvas() {
  return canvas;
}

export function setCanvasListeners(l: typeof listeners) {
  listeners = l;
}

export function getArtboardSize() {
  return { width: ARTBOARD_W, height: ARTBOARD_H };
}

export function setArtboardSize(w: number, h: number) {
  ARTBOARD_W = w;
  ARTBOARD_H = h;
  if (!canvas) return;
  canvas.setDimensions({ width: w, height: h });
  canvas.requestRenderAll();
}

function canvasJSON() {
  if (!canvas) return null;
  return canvas.toJSON();
}

export function pushHistory() {
  if (!canvas || historyLock) return;
  const json = JSON.stringify(canvasJSON());
  history = history.slice(0, historyIndex + 1);
  // skip duplicate consecutive states
  if (history[historyIndex] === json) {
    listeners.onHistory?.(historyIndex > 0, historyIndex < history.length - 1);
    return;
  }
  history.push(json);
  if (history.length > 60) {
    history.shift();
  } else {
    historyIndex = history.length - 1;
  }
  historyIndex = history.length - 1;
  listeners.onHistory?.(historyIndex > 0, false);
}

function resetHistoryFromCurrent() {
  if (!canvas) return;
  history = [JSON.stringify(canvasJSON())];
  historyIndex = 0;
  listeners.onHistory?.(false, false);
}

export async function undo() {
  if (!canvas || historyIndex <= 0) return;
  historyLock = true;
  try {
    historyIndex -= 1;
    await canvas.loadFromJSON(JSON.parse(history[historyIndex]));
    reinstallCropControlsOnAll();
    canvas.requestRenderAll();
  } finally {
    historyLock = false;
  }
  listeners.onLayers?.();
  listeners.onSelection?.();
  notifyObjectCount();
  listeners.onHistory?.(historyIndex > 0, historyIndex < history.length - 1);
}

export async function redo() {
  if (!canvas || historyIndex >= history.length - 1) return;
  historyLock = true;
  try {
    historyIndex += 1;
    await canvas.loadFromJSON(JSON.parse(history[historyIndex]));
    reinstallCropControlsOnAll();
    canvas.requestRenderAll();
  } finally {
    historyLock = false;
  }
  listeners.onLayers?.();
  listeners.onSelection?.();
  notifyObjectCount();
  listeners.onHistory?.(historyIndex > 0, historyIndex < history.length - 1);
}

function reinstallCropControlsOnAll() {
  if (!canvas) return;
  canvas.getObjects().forEach((o) => {
    if (isCroppable(o)) installCropControls(o);
  });
}

export function getLayers(): LayerInfo[] {
  if (!canvas) return [];
  const objs = canvas.getObjects().slice().reverse();
  return objs.map((obj) => {
    const o = asBa(obj);
    return {
      id: o.baId || uid(),
      name: o.baName || guessName(obj),
      visible: obj.visible !== false,
      locked: !!o.baLocked || obj.selectable === false,
      type: obj.type || 'object',
    };
  });
}

export function getSelectionProps(): {
  count: number;
  props: SelectionProps | null;
  selectedIds: string[];
} {
  if (!canvas) return { count: 0, props: null, selectedIds: [] };
  const active = canvas.getActiveObjects();
  if (!active.length) return { count: 0, props: null, selectedIds: [] };
  const obj = asBa(active[0]);
  const fillRaw = obj.fill;
  const strokeRaw = obj.stroke;
  const fill =
    fillRaw == null || fillRaw === '' || fillRaw === 'none'
      ? 'transparent'
      : typeof fillRaw === 'string'
        ? fillRaw
        : '#000000';
  const stroke =
    strokeRaw == null || strokeRaw === '' || strokeRaw === 'none'
      ? 'transparent'
      : typeof strokeRaw === 'string'
        ? strokeRaw
        : '#111827';
  const fontSize =
    'fontSize' in obj && typeof (obj as IText).fontSize === 'number'
      ? (obj as IText).fontSize
      : undefined;
  const fontFamily =
    'fontFamily' in obj && typeof (obj as IText).fontFamily === 'string'
      ? (obj as IText).fontFamily
      : undefined;
  const fontWeight =
    'fontWeight' in obj ? (obj as IText).fontWeight : undefined;
  const fontStyle =
    'fontStyle' in obj && typeof (obj as IText).fontStyle === 'string'
      ? (obj as IText).fontStyle
      : undefined;
  const underline =
    'underline' in obj ? !!(obj as IText).underline : undefined;
  const linethrough =
    'linethrough' in obj ? !!(obj as IText).linethrough : undefined;
  const textAlignRaw =
    'textAlign' in obj && typeof (obj as IText).textAlign === 'string'
      ? (obj as IText).textAlign
      : undefined;
  const textAlign =
    textAlignRaw === 'left' ||
    textAlignRaw === 'center' ||
    textAlignRaw === 'right' ||
    textAlignRaw === 'justify'
      ? textAlignRaw
      : undefined;
  const lineHeight =
    'lineHeight' in obj && typeof (obj as IText).lineHeight === 'number'
      ? (obj as IText).lineHeight
      : undefined;
  const typeLower = (obj.type || '').toLowerCase();
  const isTextType =
    typeLower === 'i-text' || typeLower === 'textbox' || typeLower === 'text';
  const textContent =
    isTextType && 'text' in obj && typeof (obj as IText).text === 'string'
      ? (obj as IText).text
      : '';
  const textLines = isTextType
    ? textContent.split('\n').filter((l) => l.trim().length > 0)
    : [];
  const hasBullets = isTextType
    ? textLines.length > 0 && textLines.every((l) => /^\s*[•○□■]\s?/.test(l))
    : undefined;
  const hasNumbers = isTextType
    ? textLines.length > 0 && textLines.every((l) => /^\s*\d+[.)]\s+/.test(l))
    : undefined;
  const bulletStyle = isTextType
    ? (() => {
        if (!textLines.length) return null;
        const map: Record<string, 'disc' | 'circle' | 'square' | 'filled-square'> = {
          '•': 'disc',
          '○': 'circle',
          '□': 'square',
          '■': 'filled-square',
        };
        let style: 'disc' | 'circle' | 'square' | 'filled-square' | null = null;
        for (const line of textLines) {
          const m = line.match(/^\s*([•○□■])\s?/);
          if (!m) return null;
          const s = map[m[1]] || 'disc';
          if (style == null) style = s;
        }
        return style;
      })()
    : undefined;
  // Super/sub: object-level deltaY (char styles detected live in UI when editing)
  const scriptMode: 'none' | 'super' | 'sub' | undefined = isTextType
    ? (() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dy = (obj as any).deltaY;
        if (typeof dy === 'number' && dy < -1) return 'super';
        if (typeof dy === 'number' && dy > 1) return 'sub';
        return 'none';
      })()
    : undefined;
  const isTextBox =
    typeLower === 'textbox' || !!(obj as FabricObject & { baTextBox?: boolean }).baTextBox;
  const bgRaw =
    'backgroundColor' in obj
      ? (obj as Textbox).backgroundColor
      : undefined;
  const backgroundColor =
    bgRaw == null || bgRaw === '' || bgRaw === 'none'
      ? 'transparent'
      : typeof bgRaw === 'string'
        ? bgRaw
        : 'transparent';

  return {
    count: active.length,
    selectedIds: active.map((o) => asBa(o).baId || ''),
    props: {
      fill,
      stroke,
      strokeWidth: obj.strokeWidth ?? 0,
      opacity: obj.opacity ?? 1,
      angle: obj.angle ?? 0,
      scaleX: obj.scaleX ?? 1,
      scaleY: obj.scaleY ?? 1,
      left: Math.round(obj.left ?? 0),
      top: Math.round(obj.top ?? 0),
      width: Math.round((obj.width ?? 0) * (obj.scaleX ?? 1)),
      height: Math.round((obj.height ?? 0) * (obj.scaleY ?? 1)),
      name: obj.baName || guessName(obj),
      locked: !!obj.baLocked,
      flipX: !!obj.flipX,
      flipY: !!obj.flipY,
      fontSize,
      fontFamily,
      fontWeight,
      fontStyle,
      underline,
      linethrough,
      textAlign,
      lineHeight,
      hasBullets,
      hasNumbers,
      bulletStyle: isTextType ? bulletStyle ?? null : undefined,
      scriptMode,
      isText:
        typeLower === 'i-text' || typeLower === 'textbox' || typeLower === 'text',
      isTextBox,
      backgroundColor: isTextBox ? backgroundColor : undefined,
    },
  };
}

export function selectById(id: string) {
  if (!canvas) return;
  const obj = canvas.getObjects().find((o) => asBa(o).baId === id);
  if (obj) {
    canvas.setActiveObject(obj);
    canvas.requestRenderAll();
    listeners.onSelection?.();
  }
}

export function toggleVisibility(id: string) {
  if (!canvas) return;
  const obj = canvas.getObjects().find((o) => asBa(o).baId === id);
  if (!obj) return;
  obj.visible = !obj.visible;
  canvas.requestRenderAll();
  listeners.onLayers?.();
  pushHistory();
}

export function toggleLock(id: string) {
  if (!canvas) return;
  const obj = canvas.getObjects().find((o) => asBa(o).baId === id) as BaObject | undefined;
  if (!obj) return;
  obj.baLocked = !obj.baLocked;
  obj.selectable = !obj.baLocked;
  obj.evented = !obj.baLocked;
  if (obj.baLocked && canvas.getActiveObjects().includes(obj)) {
    canvas.discardActiveObject();
  }
  canvas.requestRenderAll();
  listeners.onLayers?.();
  listeners.onSelection?.();
  pushHistory();
}

export function renameLayer(id: string, name: string) {
  if (!canvas) return;
  const obj = canvas.getObjects().find((o) => asBa(o).baId === id) as BaObject | undefined;
  if (!obj) return;
  obj.baName = name;
  listeners.onLayers?.();
  listeners.onSelection?.();
}

export function bringForward() {
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  if (!objs.length) return;
  // Front-most first so relative order is preserved
  const ordered = [...objs].sort(
    (a, b) => canvas!.getObjects().indexOf(b) - canvas!.getObjects().indexOf(a),
  );
  ordered.forEach((obj) => canvas!.bringObjectForward(obj));
  canvas.requestRenderAll();
  listeners.onLayers?.();
  pushHistory();
}

export function sendBackward() {
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  if (!objs.length) return;
  const ordered = [...objs].sort(
    (a, b) => canvas!.getObjects().indexOf(a) - canvas!.getObjects().indexOf(b),
  );
  ordered.forEach((obj) => canvas!.sendObjectBackwards(obj));
  canvas.requestRenderAll();
  listeners.onLayers?.();
  pushHistory();
}

/**
 * Reorder layers via drag-and-drop.
 * Layer list is top = front; canvas stack is index 0 = back.
 * `place` is relative to the drop target in the UI list.
 */
export function reorderLayer(
  draggedId: string,
  overId: string,
  place: 'before' | 'after',
) {
  if (!canvas || draggedId === overId) return;

  const objects = canvas.getObjects().slice();
  // UI order: front first
  const ui = objects.slice().reverse();
  const from = ui.findIndex((o) => asBa(o).baId === draggedId);
  let to = ui.findIndex((o) => asBa(o).baId === overId);
  if (from < 0 || to < 0) return;

  const [item] = ui.splice(from, 1);
  if (from < to) to -= 1;
  let insertAt = place === 'before' ? to : to + 1;
  insertAt = Math.max(0, Math.min(insertAt, ui.length));
  ui.splice(insertAt, 0, item);

  // Desired canvas order: back first
  const next = ui.slice().reverse();
  for (let i = 0; i < next.length; i++) {
    if (canvas.item(i) !== next[i]) {
      canvas.moveObjectTo(next[i], i);
    }
  }

  canvas.requestRenderAll();
  listeners.onLayers?.();
  pushHistory();
}

export function bringToFront() {
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  if (!objs.length) return;
  const ordered = [...objs].sort(
    (a, b) => canvas!.getObjects().indexOf(a) - canvas!.getObjects().indexOf(b),
  );
  ordered.forEach((obj) => canvas!.bringObjectToFront(obj));
  canvas.requestRenderAll();
  listeners.onLayers?.();
  pushHistory();
}

export function sendToBack() {
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  if (!objs.length) return;
  const ordered = [...objs].sort(
    (a, b) => canvas!.getObjects().indexOf(b) - canvas!.getObjects().indexOf(a),
  );
  ordered.forEach((obj) => canvas!.sendObjectToBack(obj));
  canvas.requestRenderAll();
  listeners.onLayers?.();
  pushHistory();
}

/** In-memory cut/copy buffer for canvas objects (JSON). */
let objectClipboard: { objects: Record<string, unknown>[] } | null = null;

const BA_PROPS = ['baId', 'baName', 'baLocked', 'baReactionId', 'baReagentSlot'] as const;

export function hasObjectClipboard(): boolean {
  return !!(objectClipboard && objectClipboard.objects.length);
}

/** Serialize active selection into the internal object clipboard (+ optional system SVG). */
export async function copySelectionToClipboard(): Promise<boolean> {
  if (!canvas) return false;
  const active = canvas.getActiveObject();
  if (!active) return false;

  const members = isActiveSelection(active)
    ? canvas.getActiveObjects()
    : [active];

  objectClipboard = {
    objects: members.map((o) => o.toObject([...BA_PROPS]) as Record<string, unknown>),
  };

  // Also put SVG on system clipboard when possible (for external paste / figure paste)
  try {
    const svg = exportSelectionSvg();
    if (svg && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(svg);
    }
  } catch {
    /* permission / non-secure context */
  }
  return true;
}

export async function cutSelectionToClipboard(): Promise<boolean> {
  const ok = await copySelectionToClipboard();
  if (!ok) return false;
  deleteSelection();
  return true;
}

/** Paste objects from the internal cut/copy buffer (offset slightly). */
export async function pasteObjectClipboard(offset = 24): Promise<boolean> {
  if (!canvas || !objectClipboard?.objects.length) return false;

  try {
    const enlivened = await util.enlivenObjects(objectClipboard.objects);
    const objs = (Array.isArray(enlivened) ? enlivened : [enlivened]).filter(
      Boolean,
    ) as FabricObject[];
    if (!objs.length) return false;

    withHistory(() => {
      const added: FabricObject[] = [];
      for (const obj of objs) {
        reassignIds(obj);
        const base = asBa(obj).baName || guessName(obj);
        asBa(obj).baName = base.endsWith(' copy') ? base : `${base} copy`;
        obj.set({
          left: (obj.left ?? 0) + offset,
          top: (obj.top ?? 0) + offset,
          evented: true,
          selectable: true,
        });
        ensureMeta(obj, asBa(obj).baName);
        canvas!.add(obj);
        added.push(obj);
      }
      if (added.length === 1) {
        canvas!.setActiveObject(added[0]);
      } else if (added.length > 1) {
        canvas!.discardActiveObject();
        const sel = new ActiveSelection(added, { canvas: canvas! });
        canvas!.setActiveObject(sel);
      }
      canvas!.requestRenderAll();
    });
    return true;
  } catch (e) {
    console.error('pasteObjectClipboard', e);
    return false;
  }
}

/**
 * Right-click helper: select the object under the pointer if it isn't already
 * part of the current selection. Returns whether something is selected after.
 *
 * IMPORTANT: Do NOT call fabric findTarget() with a raw MouseEvent — Fabric 7
 * expects an internal event shape (e.onSelect) and will throw, killing the menu.
 */
export function selectTargetAtEvent(e: MouseEvent | PointerEvent): boolean {
  if (!canvas) return false;
  try {
    const el = canvas.getElement();
    // Prefer upper canvas for correct hit-testing coords
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upper = (canvas as any).upperCanvasEl as HTMLCanvasElement | undefined;
    const surface = upper || el;
    const rect = surface.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      return canvas.getActiveObjects().length > 0;
    }
    // Map client → fabric scene coords (accounts for CSS scale + viewport transform)
    const scaleX = (canvas.getWidth() || rect.width) / rect.width;
    const scaleY = (canvas.getHeight() || rect.height) / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vpt = canvas.viewportTransform as number[] | undefined;
    let sceneX = x;
    let sceneY = y;
    if (vpt && vpt.length >= 6) {
      const inv = util.invertTransform(vpt as TMat2D);
      const p = util.transformPoint(new Point(x, y), inv);
      sceneX = p.x;
      sceneY = p.y;
    }

    const objects = canvas.getObjects();
    const hitPt = new Point(sceneX, sceneY);
    // Top-most first
    let target: FabricObject | undefined;
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (!obj.visible || obj.evented === false) continue;
      try {
        if (obj.containsPoint(hitPt)) {
          target = obj;
          break;
        }
      } catch {
        // Fallback: bounding box hit test
        const b = obj.getBoundingRect();
        if (
          sceneX >= b.left &&
          sceneX <= b.left + b.width &&
          sceneY >= b.top &&
          sceneY <= b.top + b.height
        ) {
          target = obj;
          break;
        }
      }
    }

    if (target && !isActiveSelection(target)) {
      const active = canvas.getActiveObjects();
      if (!active.includes(target)) {
        canvas.setActiveObject(target);
        canvas.requestRenderAll();
        listeners.onSelection?.();
      }
      return true;
    }
  } catch (err) {
    console.warn('selectTargetAtEvent', err);
  }
  return canvas.getActiveObjects().length > 0;
}

/** Attach native contextmenu listener on Fabric upper canvas (most reliable). */
export function bindCanvasContextMenu(
  handler: (e: MouseEvent) => void,
): () => void {
  if (!canvas) return () => {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upper = (canvas as any).upperCanvasEl as HTMLCanvasElement | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lower = (canvas as any).lowerCanvasEl as HTMLCanvasElement | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const container = (canvas as any).wrapperEl as HTMLElement | undefined;
  const targets = [upper, lower, container].filter(Boolean) as HTMLElement[];
  const onCtx = (e: Event) => {
    const me = e as MouseEvent;
    me.preventDefault();
    me.stopPropagation();
    handler(me);
  };
  for (const t of targets) {
    t.addEventListener('contextmenu', onCtx);
  }
  return () => {
    for (const t of targets) {
      t.removeEventListener('contextmenu', onCtx);
    }
  };
}

/** SVG markup for the current selection only (not whole artboard). */
export function exportSelectionSvg(): string | null {
  if (!canvas) return null;
  const active = canvas.getActiveObject();
  if (!active) return null;
  try {
    const raw = active.toSVG();
    if (!raw || !raw.includes('<')) return null;
    const bound = active.getBoundingRect();
    const w = Math.max(1, Math.ceil(bound.width || 100));
    const h = Math.max(1, Math.ceil(bound.height || 100));
    let svg = raw.trim();
    // Fabric often emits a fragment or svg without xmlns — fix for <img> thumbs
    if (!/^\s*<svg\b/i.test(svg)) {
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${svg}</svg>`;
    } else {
      const open = svg.match(/<svg\b[^>]*>/i)?.[0] || '';
      if (!/\sxmlns\s*=/.test(open)) {
        svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      if (/\sxlink:/.test(svg) && !/\sxmlns:xlink\s*=/.test(open)) {
        svg = svg.replace(/<svg\b/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
      }
      if (!/\bviewBox\s*=/i.test(svg.match(/<svg\b[^>]*>/i)?.[0] || '')) {
        svg = svg.replace(/<svg\b([^>]*)>/i, `<svg$1 viewBox="0 0 ${w} ${h}">`);
      }
    }
    return svg;
  } catch {
    return null;
  }
}

/** Download current selection as an .svg file. */
export function downloadSelectionSvg(filename = 'selection.svg'): boolean {
  const svg = exportSelectionSvg();
  if (!svg) return false;
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.replace(/[^\w.\-]+/g, '_') || 'selection.svg';
  a.click();
  URL.revokeObjectURL(a.href);
  return true;
}

/**
 * Build a library icon from the current selection (for favorites).
 * Always tries to store a PNG data-URL in `path` so the favorites dock
 * shows a reliable thumbnail (SVG-from-Fabric often breaks in <img>).
 * Keeps SVG in svgContent when available for crisp re-placement.
 */
export function selectionAsLibraryIcon(): {
  id: string;
  name: string;
  category: 'symbols';
  path: string;
  svgContent?: string;
  source: 'user';
} | null {
  if (!canvas) return null;
  const active = canvas.getActiveObject();
  if (!active) return null;
  const name = asBa(active).baName || guessName(active);
  const id = `fav/${asBa(active).baId || uid()}-${Date.now()}`;

  // Raster thumbnail — most reliable for the dock
  let thumbPng = '';
  try {
    const br = active.getBoundingRect();
    const maxSide = Math.max(br.width || 1, br.height || 1, 1);
    const mult = Math.min(2.5, Math.max(0.5, 120 / maxSide));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (active as any).toDataURL === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      thumbPng = (active as any).toDataURL({
        format: 'png',
        multiplier: mult,
        enableRetinaScaling: false,
      });
    }
  } catch (err) {
    console.warn('[selectionAsLibraryIcon] toDataURL failed', err);
  }

  // Vector for re-place (groups / paths / text)
  let svg: string | null = null;
  try {
    svg = exportSelectionSvg();
  } catch {
    svg = null;
  }

  // Prefer PNG path for display; keep SVG for place when present
  if (!thumbPng && !svg) return null;

  // If only SVG, also store a data-URL path so older UI still has something
  let path = thumbPng;
  if (!path && svg) {
    try {
      path = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } catch {
      path = '';
    }
  }

  return {
    id,
    name,
    category: 'symbols',
    path,
    svgContent: svg || undefined,
    source: 'user',
  };
}

/**
 * Find an open spot near the artboard center that doesn’t heavily overlap
 * existing objects (for click-to-place from favorites / library).
 */
export function findClearPlacement(opts?: {
  size?: number;
  prefer?: { left: number; top: number };
}): { left: number; top: number } {
  const size = opts?.size ?? 140;
  const prefer = opts?.prefer ?? { left: ARTBOARD_W / 2, top: ARTBOARD_H / 2 };
  if (!canvas) return prefer;

  const objs = canvas.getObjects().filter((o) => o.visible !== false);
  const pad = size * 0.45;
  const overlaps = (x: number, y: number) => {
    for (const o of objs) {
      try {
        const b = o.getBoundingRect();
        const cx = (b.left ?? 0) + (b.width ?? 0) / 2;
        const cy = (b.top ?? 0) + (b.height ?? 0) / 2;
        if (Math.abs(cx - x) < pad && Math.abs(cy - y) < pad) return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  };

  if (!overlaps(prefer.left, prefer.top)) return prefer;

  // Spiral search outward
  const step = Math.max(40, size * 0.55);
  for (let ring = 1; ring <= 16; ring++) {
    const n = ring * 6;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      const left = prefer.left + Math.cos(a) * step * ring;
      const top = prefer.top + Math.sin(a) * step * ring * 0.85;
      if (left < 40 || top < 40 || left > ARTBOARD_W - 40 || top > ARTBOARD_H - 40) continue;
      if (!overlaps(left, top)) return { left, top };
    }
  }
  // Last resort: cascade offset
  placeCascade = (placeCascade + 1) % 12;
  return {
    left: prefer.left + placeCascade * 28,
    top: prefer.top + placeCascade * 18,
  };
}

export function getSelectionCount(): number {
  return canvas?.getActiveObjects().length ?? 0;
}

export function selectionIsGroup(): boolean {
  if (!canvas) return false;
  const active = canvas.getActiveObject();
  return !!(active && isGroup(active));
}

export function deleteSelection() {
  if (!canvas) return;
  const active = canvas.getActiveObjects();
  if (!active.length) return;
  withHistory(() => {
    canvas!.discardActiveObject();
    active.forEach((o) => canvas!.remove(o));
    canvas!.requestRenderAll();
  });
}

function reassignIds(obj: FabricObject, nameSuffix = '') {
  const o = asBa(obj);
  o.baId = uid();
  if (nameSuffix && o.baName) o.baName = o.baName + nameSuffix;
  const anyObj = obj as FabricObject & { _objects?: FabricObject[] };
  if (anyObj._objects) {
    anyObj._objects.forEach((child) => reassignIds(child));
  }
}

export function duplicateSelection() {
  if (!canvas) return;
  const active = canvas.getActiveObject();
  if (!active) return;

  // Multi-select ActiveSelection: clone each member
  if (isActiveSelection(active)) {
    const objs = [...canvas.getActiveObjects()];
    void (async () => {
      batchMode = true;
      historyLock = true;
      try {
        for (const src of objs) {
          const cloned = await src.clone();
          cloned.set({
            left: (src.left ?? 0) + 20,
            top: (src.top ?? 0) + 20,
            evented: true,
          });
          reassignIds(cloned);
          const base = asBa(src).baName || guessName(src);
          asBa(cloned).baName = base.endsWith(' copy') ? base : `${base} copy`;
          canvas!.add(cloned);
        }
        canvas!.discardActiveObject();
        canvas!.requestRenderAll();
      } finally {
        historyLock = false;
        batchMode = false;
        pushHistory();
        listeners.onLayers?.();
        listeners.onSelection?.();
        notifyObjectCount();
      }
    })();
    return;
  }

  active.clone().then((cloned: FabricObject) => {
    withHistory(() => {
      cloned.set({
        left: (active.left ?? 0) + 20,
        top: (active.top ?? 0) + 20,
        evented: true,
      });
      reassignIds(cloned);
      const base = asBa(active).baName || guessName(active);
      asBa(cloned).baName = base.endsWith(' copy') ? base : `${base} copy`;
      canvas!.add(cloned);
      canvas!.setActiveObject(cloned);
      canvas!.requestRenderAll();
    });
  });
}

export function groupSelection() {
  if (!canvas) return;
  const active = canvas.getActiveObjects();
  if (active.length < 2) return;
  const objs = [...active];
  withHistory(() => {
    canvas!.discardActiveObject();
    objs.forEach((o) => canvas!.remove(o));
    const group = new Group(objs);
    ensureMeta(group, 'Group');
    canvas!.add(group);
    canvas!.setActiveObject(group);
    canvas!.requestRenderAll();
  });
}

export function ungroupSelection() {
  if (!canvas) return;
  const active = canvas.getActiveObject();
  // Critical: ActiveSelection extends Group in Fabric — must not ungroup multi-select
  if (!active || isActiveSelection(active) || !isGroup(active)) return;
  const group = active as Group;
  withHistory(() => {
    const items = group.removeAll();
    canvas!.remove(group);
    items.forEach((item) => {
      ensureMeta(item);
      canvas!.add(item);
    });
    canvas!.discardActiveObject();
    canvas!.requestRenderAll();
  });
}

export function alignSelection(mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') {
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  if (objs.length < 2) return;

  const bounds = objs.map((o) => o.getBoundingRect());
  const minL = Math.min(...bounds.map((b) => b.left));
  const maxR = Math.max(...bounds.map((b) => b.left + b.width));
  const minT = Math.min(...bounds.map((b) => b.top));
  const maxB = Math.max(...bounds.map((b) => b.top + b.height));
  const midX = (minL + maxR) / 2;
  const midY = (minT + maxB) / 2;

  withHistory(() => {
    objs.forEach((o, i) => {
      const b = bounds[i];
      const dx =
        mode === 'left'
          ? minL - b.left
          : mode === 'right'
            ? maxR - (b.left + b.width)
            : mode === 'center'
              ? midX - (b.left + b.width / 2)
              : 0;
      const dy =
        mode === 'top'
          ? minT - b.top
          : mode === 'bottom'
            ? maxB - (b.top + b.height)
            : mode === 'middle'
              ? midY - (b.top + b.height / 2)
              : 0;
      o.set({
        left: (o.left ?? 0) + dx,
        top: (o.top ?? 0) + dy,
      });
      o.setCoords();
    });
    canvas!.requestRenderAll();
  });
}

export function distributeSelection(axis: 'horizontal' | 'vertical') {
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  if (objs.length < 3) return;

  const items = objs.map((o) => ({
    o,
    b: o.getBoundingRect(),
  }));

  withHistory(() => {
    if (axis === 'horizontal') {
      items.sort((a, b) => a.b.left - b.b.left);
      const first = items[0].b.left;
      const last = items[items.length - 1].b.left + items[items.length - 1].b.width;
      const totalW = items.reduce((s, i) => s + i.b.width, 0);
      const gap = (last - first - totalW) / (items.length - 1);
      let cursor = first;
      items.forEach(({ o, b }) => {
        const dx = cursor - b.left;
        o.set({ left: (o.left ?? 0) + dx });
        o.setCoords();
        cursor += b.width + gap;
      });
    } else {
      items.sort((a, b) => a.b.top - b.b.top);
      const first = items[0].b.top;
      const last = items[items.length - 1].b.top + items[items.length - 1].b.height;
      const totalH = items.reduce((s, i) => s + i.b.height, 0);
      const gap = (last - first - totalH) / (items.length - 1);
      let cursor = first;
      items.forEach(({ o, b }) => {
        const dy = cursor - b.top;
        o.set({ top: (o.top ?? 0) + dy });
        o.setCoords();
        cursor += b.height + gap;
      });
    }
    canvas!.requestRenderAll();
  });
}

export function setGridVisible(show: boolean) {
  if (!canvas) return;
  if (show) {
    // light grid overlay via background pattern approximation using CSS on wrapper;
    // canvas itself keeps white artboard — grid drawn as overlay lines via lower canvas isn't free.
    // Use a simple repeating background on fabric via pattern isn't trivial without image.
    // Store flag is UI-side; draw grid as objects? Better: overlay in React.
  }
  void show;
}

export async function addImageFromDataUrl(
  dataUrl: string,
  opts?: { left?: number; top?: number; name?: string; maxSize?: number },
) {
  if (!canvas) return null;
  const img = await FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' });
  const maxSize = opts?.maxSize ?? 220;
  const w = img.width || maxSize;
  const h = img.height || maxSize;
  const scale = Math.min(maxSize / w, maxSize / h, 1);
  img.set({
    left: opts?.left ?? ARTBOARD_W / 2,
    top: opts?.top ?? ARTBOARD_H / 2,
    originX: 'center',
    originY: 'center',
    scaleX: scale,
    scaleY: scale,
  });
  ensureMeta(img, opts?.name || 'Image');
  canvas.add(img);
  canvas.setActiveObject(img);
  canvas.requestRenderAll();
  return img;
}

/** True when the active selection is a single raster image (FabricImage). */
export function selectionIsRasterImage(): boolean {
  if (!canvas) return false;
  const active = canvas.getActiveObject();
  if (!active || isActiveSelection(active)) return false;
  return (
    active instanceof FabricImage ||
    (active.type || '').toLowerCase() === 'image'
  );
}

/** Figures / pictures that support side-crop + corner reshape. */
export function selectionIsCroppable(): boolean {
  if (!canvas) return false;
  const active = canvas.getActiveObject();
  if (!active || isActiveSelection(active)) return false;
  return isCroppable(active);
}

function installCropControlsOnSelection() {
  if (!canvas) return;
  const active = canvas.getActiveObject();
  if (!active || isActiveSelection(active)) return;
  if (isCroppable(active)) {
    installCropControls(active);
    canvas.requestRenderAll();
  }
}

/** Enter Canva-style crop mode (drag sides to crop). */
export function beginCropMode(): boolean {
  if (!canvas) return false;
  const active = canvas.getActiveObject();
  if (!active || isActiveSelection(active)) return false;
  if (!isCroppable(active)) return false;
  return enterCropModeImpl(active);
}

export function endCropMode(): void {
  if (isCropModeActiveImpl()) exitCropModeImpl();
}

export function isCropModeActive(): boolean {
  return isCropModeActiveImpl();
}

export function exitCropMode(): void {
  exitCropModeImpl();
}

/** Reset crop on the selected figure/picture. */
export function resetSelectionCrop(): boolean {
  if (!canvas) return false;
  const active = canvas.getActiveObject();
  if (!active || isActiveSelection(active)) return false;
  if (!isCroppable(active)) return false;
  resetCrop(active);
  installCropControls(active);
  if (isCropModeActiveImpl()) exitCropModeImpl();
  canvas.requestRenderAll();
  pushHistory();
  listeners.onSelection?.();
  return true;
}

/**
 * Phase 1: key out white / solid background on the selected raster image.
 * Replaces the image source with a transparent PNG (in place).
 */
export async function removeSolidBackgroundFromSelection(opts?: {
  tolerance?: number;
  color?: { r: number; g: number; b: number };
}): Promise<{ ok: boolean; removed?: number; error?: string }> {
  if (!canvas) return { ok: false, error: 'Canvas not ready' };
  const active = canvas.getActiveObject();
  if (!active || isActiveSelection(active)) {
    return { ok: false, error: 'Select a single image first' };
  }
  if (
    !(active instanceof FabricImage) &&
    (active.type || '').toLowerCase() !== 'image'
  ) {
    return { ok: false, error: 'Background remove works on raster images (PNG/JPG), not SVG groups' };
  }

  const img = active as FabricImage;
  try {
    // Prefer the live element; fall back to getSrc()
    const el =
      typeof img.getElement === 'function'
        ? img.getElement()
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (img as any)._element;
    const src =
      el && (el instanceof HTMLImageElement || el instanceof HTMLCanvasElement)
        ? el
        : typeof img.getSrc === 'function'
          ? img.getSrc()
          : '';

    if (!src) {
      return { ok: false, error: 'Could not read image pixels' };
    }

    const { removeSolidBackgroundFromSource } = await import('./removeSolidBackground');
    const { dataUrl, removed } = await removeSolidBackgroundFromSource(src, {
      tolerance: opts?.tolerance ?? 28,
      color: opts?.color ?? { r: 255, g: 255, b: 255 },
      borderConnectedOnly: false,
    });

    if (removed < 1) {
      return { ok: false, error: 'No white/solid background pixels found (try a different image)' };
    }

    // Preserve transform while swapping pixels
    const left = img.left;
    const top = img.top;
    const scaleX = img.scaleX;
    const scaleY = img.scaleY;
    const angle = img.angle;
    const originX = img.originX;
    const originY = img.originY;
    const flipX = img.flipX;
    const flipY = img.flipY;
    const name = asBa(img).baName;

    if (typeof img.setSrc === 'function') {
      await img.setSrc(dataUrl, { crossOrigin: 'anonymous' });
    } else {
      // Fallback: replace object
      const next = await FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' });
      next.set({ left, top, scaleX, scaleY, angle, originX, originY, flipX, flipY });
      ensureMeta(next, name);
      canvas.remove(img);
      canvas.add(next);
      canvas.setActiveObject(next);
      canvas.requestRenderAll();
      pushHistory();
      listeners.onLayers?.();
      listeners.onSelection?.();
      return { ok: true, removed };
    }

    img.set({ left, top, scaleX, scaleY, angle, originX, originY, flipX, flipY });
    // Keep display size stable if natural size changed slightly
    img.setCoords();
    ensureMeta(img, name);
    // Mark so we know BG was processed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (img as any).baBgRemoved = true;
    canvas.requestRenderAll();
    pushHistory();
    listeners.onLayers?.();
    listeners.onSelection?.();
    return { ok: true, removed };
  } catch (err) {
    console.error('[removeSolidBackground]', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Background remove failed',
    };
  }
}

/** Register the overflow scroll container around the artboard (for pan + scrollbars). */
export function setCanvasScrollElement(el: HTMLElement | null) {
  scrollEl = el;
}

export function getCanvasScrollElement() {
  return scrollEl;
}

/**
 * Pan the view. When a scroll container is registered (normal UI path),
 * this scrolls it so zoomed-in artboards get real scrollbars.
 */
export function panBy(dx: number, dy: number) {
  if (scrollEl) {
    scrollEl.scrollLeft -= dx;
    scrollEl.scrollTop -= dy;
    return;
  }
  if (!canvas) return;
  const vpt = canvas.viewportTransform;
  if (!vpt) return;
  vpt[4] += dx;
  vpt[5] += dy;
  canvas.setViewportTransform(vpt);
  canvas.requestRenderAll();
}

export function setSnap(enabled: boolean) {
  if (!canvas) return;
  // Smart alignment guides (edges / centers / artboard) while dragging
  (canvas as unknown as { baSnap?: boolean }).baSnap = enabled;
  if (!enabled) clearAlignGuides(canvas);
}

export function initSnapHandler() {
  if (!canvas) return;
  bindAlignGuideHandlers(
    canvas,
    () => ({ width: ARTBOARD_W, height: ARTBOARD_H }),
    () => !!(canvas as unknown as { baSnap?: boolean }).baSnap,
  );
}

export function applyProps(partial: Partial<SelectionProps>) {
  if (!canvas) return;
  const active = canvas.getActiveObjects();
  if (!active.length) return;

  active.forEach((obj) => {
    const o = asBa(obj);
    if (partial.name !== undefined && active.length === 1) o.baName = partial.name;
    if (partial.fill !== undefined) setFillRecursive(obj, partial.fill);
    if (partial.stroke !== undefined) setStrokeRecursive(obj, partial.stroke);
    if (partial.strokeWidth !== undefined) setStrokeWidthRecursive(obj, partial.strokeWidth);
    if (partial.opacity !== undefined) obj.set('opacity', partial.opacity);
    if (partial.angle !== undefined) obj.set('angle', partial.angle);
    if (partial.flipX !== undefined) obj.set('flipX', partial.flipX);
    if (partial.flipY !== undefined) obj.set('flipY', partial.flipY);
    if (partial.left !== undefined) obj.set('left', partial.left);
    if (partial.top !== undefined) obj.set('top', partial.top);
    if (partial.fontSize !== undefined && 'fontSize' in obj) {
      (obj as IText).set('fontSize', partial.fontSize);
    }
    if (partial.fontFamily !== undefined && 'fontFamily' in obj) {
      (obj as IText).set('fontFamily', partial.fontFamily);
    }
    if (partial.fontWeight !== undefined && 'fontWeight' in obj) {
      (obj as IText).set('fontWeight', partial.fontWeight);
    }
    if (partial.fontStyle !== undefined && 'fontStyle' in obj) {
      (obj as IText).set('fontStyle', partial.fontStyle);
    }
    if (partial.underline !== undefined && 'underline' in obj) {
      (obj as IText).set('underline', partial.underline);
    }
    if (partial.linethrough !== undefined && 'linethrough' in obj) {
      (obj as IText).set('linethrough', partial.linethrough);
    }
    if (partial.textAlign !== undefined && 'textAlign' in obj) {
      (obj as IText).set('textAlign', partial.textAlign);
    }
    if (partial.lineHeight !== undefined && 'lineHeight' in obj) {
      const lh = Math.max(0, Math.min(2, Math.round(partial.lineHeight * 10) / 10));
      (obj as IText).set('lineHeight', lh);
      if (typeof (obj as Textbox).initDimensions === 'function') {
        (obj as Textbox).initDimensions();
      }
    }
    if (partial.backgroundColor !== undefined && 'backgroundColor' in obj) {
      const bg = isNoneColor(partial.backgroundColor)
        ? ''
        : partial.backgroundColor;
      (obj as Textbox).set('backgroundColor', bg);
    }
    if (partial.locked !== undefined) {
      o.baLocked = partial.locked;
      obj.selectable = !partial.locked;
      obj.evented = !partial.locked;
    }
    obj.setCoords();
  });
  canvas.requestRenderAll();
  listeners.onSelection?.();
  listeners.onLayers?.();
  scheduleHistoryPush();
}

let historyTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleHistoryPush() {
  if (historyTimer) clearTimeout(historyTimer);
  historyTimer = setTimeout(() => {
    historyTimer = null;
    pushHistory();
  }, 280);
}

function isNoneColor(c: string) {
  const v = (c || '').trim().toLowerCase();
  return (
    v === '' ||
    v === 'none' ||
    v === 'transparent' ||
    v === 'rgba(0,0,0,0)' ||
    v === 'rgba(0, 0, 0, 0)'
  );
}

function setFillRecursive(obj: FabricObject, fill: string) {
  const anyObj = obj as FabricObject & { _objects?: FabricObject[] };
  if (anyObj._objects && Array.isArray(anyObj._objects)) {
    anyObj._objects.forEach((child) => setFillRecursive(child, fill));
  }
  const current = obj.fill;
  const t = (obj.type || '').toLowerCase();
  const next = isNoneColor(fill) ? 'transparent' : fill;
  const shapeTypes = [
    'rect',
    'ellipse',
    'circle',
    'triangle',
    'polygon',
    'i-text',
    'textbox',
    'text',
  ];
  if (isNoneColor(fill)) {
    // Always allow clearing fill on drawable types (and groups via recursion)
    if (shapeTypes.includes(t) || t === 'path' || t === 'group' || t === 'activeselection') {
      obj.set('fill', 'transparent');
    } else if (current && typeof current === 'string') {
      obj.set('fill', 'transparent');
    }
    return;
  }
  if (current && current !== 'none' && typeof current === 'string') {
    obj.set('fill', next);
  } else if (shapeTypes.includes(t)) {
    obj.set('fill', next);
  } else if (t === 'path' && current && current !== 'none') {
    obj.set('fill', next);
  }
}

function setStrokeRecursive(obj: FabricObject, stroke: string) {
  const anyObj = obj as FabricObject & { _objects?: FabricObject[] };
  if (anyObj._objects && Array.isArray(anyObj._objects)) {
    anyObj._objects.forEach((child) => setStrokeRecursive(child, stroke));
  }
  const current = obj.stroke;
  const t = (obj.type || '').toLowerCase();
  // Textbox stroke = box border (not letter outline). IText stroke would outline glyphs — skip.
  const strokeTypes = [
    'line',
    'rect',
    'ellipse',
    'circle',
    'path',
    'triangle',
    'polygon',
    'polyline',
    'textbox',
  ];
  if (isNoneColor(stroke)) {
    if (strokeTypes.includes(t) || (current && current !== 'none' && t !== 'i-text')) {
      obj.set('stroke', t === 'textbox' ? '' : 'transparent');
      if (t === 'textbox') obj.set('strokeWidth', 0);
    }
    return;
  }
  if (t === 'textbox') {
    obj.set('stroke', stroke);
    if ((obj.strokeWidth ?? 0) <= 0) obj.set('strokeWidth', 1);
    return;
  }
  if (current && current !== 'none') {
    obj.set('stroke', stroke);
  } else if (strokeTypes.includes(t)) {
    obj.set('stroke', stroke);
  }
}

function setStrokeWidthRecursive(obj: FabricObject, width: number) {
  const anyObj = obj as FabricObject & { _objects?: FabricObject[] };
  if (anyObj._objects && Array.isArray(anyObj._objects)) {
    anyObj._objects.forEach((child) => setStrokeWidthRecursive(child, width));
  }
  obj.set('strokeWidth', width);
}

let placeCascade = 0;

/** Drop full-frame white / transparent plates so SVGs (e.g. RDKit) don't mask artboard. */
function isOpaqueBackdropRect(obj: FabricObject): boolean {
  const t = (obj.type || '').toLowerCase();
  if (t !== 'rect') return false;
  const fill = obj.fill;
  if (fill == null || fill === '' || fill === 'none' || fill === 'transparent') return true;
  if (typeof fill !== 'string') return false;
  const f = fill.toLowerCase().replace(/\s+/g, '');
  const whiteish =
    f === '#fff' ||
    f === '#ffffff' ||
    f === 'white' ||
    f.startsWith('#ffffff') ||
    f.startsWith('rgb(255,255,255') ||
    f.startsWith('rgba(255,255,255');
  if (!whiteish) return false;
  // Alpha 0 in rgba → always drop
  if (/rgba\([^)]+,0(?:\.0+)?\)/.test(f)) return true;
  const w = (obj.width || 0) * Math.abs(obj.scaleX || 1);
  const h = (obj.height || 0) * Math.abs(obj.scaleY || 1);
  // Large plate (typical mol drawing canvas background)
  return w >= 40 && h >= 40;
}

export async function addSvgToCanvas(
  svgText: string,
  opts?: { left?: number; top?: number; name?: string; maxSize?: number },
) {
  if (!canvas) return null;
  const { objects } = await loadSVGFromString(svgText);
  const valid = (objects || [])
    .filter(Boolean)
    .filter((o) => !isOpaqueBackdropRect(o as FabricObject)) as FabricObject[];
  if (!valid.length) throw new Error('No drawable content in SVG');

  let target: FabricObject;
  if (valid.length === 1) {
    target = valid[0];
  } else {
    target = new Group(valid);
  }

  const maxSize = opts?.maxSize ?? 160;
  const bounds = target.getBoundingRect();
  const scale = Math.min(
    maxSize / Math.max(bounds.width || maxSize, 1),
    maxSize / Math.max(bounds.height || maxSize, 1),
    1,
  );
  // Cascade click-to-place so icons don't stack on the same point
  const cascade = opts?.left === undefined && opts?.top === undefined;
  if (cascade) placeCascade = (placeCascade + 1) % 12;
  const offset = cascade ? placeCascade * 28 : 0;
  target.set({
    left: (opts?.left ?? ARTBOARD_W / 2) + offset,
    top: (opts?.top ?? ARTBOARD_H / 2) + offset * 0.6,
    originX: 'center',
    originY: 'center',
    scaleX: scale,
    scaleY: scale,
  });
  ensureMeta(target, opts?.name || 'Icon');
  canvas.add(target);
  canvas.setActiveObject(target);
  canvas.requestRenderAll();
  return target;
}

/** Deepest black — default for every new shape / line / arrow on the artboard */
const DEEP_BLACK = '#000000';
const SHAPE_FILL = DEEP_BLACK;
const SHAPE_STROKE = DEEP_BLACK;
const LINE_STROKE = DEEP_BLACK;

function regularPolygon(sides: number, r: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI * 2 * i) / sides - Math.PI / 2;
    pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return pts;
}

function starPoints(points: number, outer: number, inner: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return pts;
}

function placeShape(obj: FabricObject, name: string) {
  if (!canvas) return;
  ensureMeta(obj, name);
  canvas.add(obj);
  canvas.setActiveObject(obj);
  canvas.requestRenderAll();
}

/** Free-standing text label (no box border). */
export function addText(text = 'Label') {
  return addTextLabel(text);
}

export function addTextLabel(text = 'Label') {
  if (!canvas) return null;
  // Leave any in-progress box-draw mode (safe no-op if inactive)
  cancelTextBoxDraw();
  const t = new IText(text, {
    left: ARTBOARD_W / 2,
    top: ARTBOARD_H / 2,
    originX: 'center',
    originY: 'center',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 24,
    fill: DEEP_BLACK,
    editable: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (t as any).hiddenTextareaContainer = getFabricTextareaHost();
  ensureMeta(t, 'Text label');
  canvas.add(t);
  canvas.setActiveObject(t);
  canvas.requestRenderAll();
  requestAnimationFrame(() => {
    try {
      pinFabricTextarea(t);
      t.enterEditing();
      t.selectAll();
    } catch {
      /* ignore */
    }
  });
  return t;
}

// ── Draw text box (click-drag) ─────────────────────────────────────────────
let textBoxDrawActive = false;
let textBoxDrawStart: { x: number; y: number } | null = null;
let textBoxDrawGuide: Rect | null = null;
let textBoxHandlersBound = false;

/**
 * Scene coords for pointer events. Must NOT use fabric getScenePoint alone —
 * the artboard is CSS-scaled (fitScale), so we map client → artboard via the
 * upper canvas bounding box (same path as drag/drop).
 */
function scenePointFromEvent(opt: {
  e?: Event;
  absolutePointer?: { x: number; y: number };
  scenePoint?: { x: number; y: number };
} | undefined): { x: number; y: number } | null {
  if (!canvas) return null;
  const e = opt?.e as MouseEvent | TouchEvent | undefined;
  let clientX: number | undefined;
  let clientY: number | undefined;
  if (e && 'clientX' in e && typeof e.clientX === 'number') {
    clientX = e.clientX;
    clientY = e.clientY;
  } else if (e && 'touches' in e && e.touches?.[0]) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else if (e && 'changedTouches' in e && e.changedTouches?.[0]) {
    clientX = e.changedTouches[0].clientX;
    clientY = e.changedTouches[0].clientY;
  }
  if (clientX != null && clientY != null) {
    // Prefer upper canvas (event target surface); fall back to lower canvas
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upper = (canvas as any).upperCanvasEl as HTMLCanvasElement | undefined;
    const el = upper || canvas.getElement();
    return clientToScene(clientX, clientY, el);
  }
  if (opt?.scenePoint) return { x: opt.scenePoint.x, y: opt.scenePoint.y };
  if (opt?.absolutePointer) return { x: opt.absolutePointer.x, y: opt.absolutePointer.y };
  return null;
}

function finishTextBoxDraw() {
  textBoxDrawActive = false;
  textBoxDrawStart = null;
  if (textBoxDrawGuide && canvas) {
    canvas.remove(textBoxDrawGuide);
    textBoxDrawGuide = null;
  }
  if (canvas) {
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
    canvas.selection = true;
    canvas.skipTargetFind = false;
    canvas.requestRenderAll();
  }
}

function onTextBoxMouseDown(opt: {
  e?: Event;
  absolutePointer?: { x: number; y: number };
  scenePoint?: { x: number; y: number };
}) {
  if (!canvas || !textBoxDrawActive) return;
  // Already drawing a guide (e.g. multi-button) — ignore
  if (textBoxDrawStart) return;
  const p = scenePointFromEvent(opt);
  if (!p) return;
  opt?.e?.preventDefault?.();
  textBoxDrawStart = p;
  // Fabric 7 defaults origin to center — force top-left so the box grows from the click
  textBoxDrawGuide = new Rect({
    left: p.x,
    top: p.y,
    width: 1,
    height: 1,
    originX: 'left',
    originY: 'top',
    fill: 'rgba(142, 197, 255, 0.08)',
    stroke: '#000000',
    strokeWidth: 1,
    strokeDashArray: [4, 3],
    selectable: false,
    evented: false,
    excludeFromExport: true,
    objectCaching: false,
  });
  batchMode = true;
  canvas.add(textBoxDrawGuide);
  batchMode = false;
  canvas.requestRenderAll();
}

function onTextBoxMouseMove(opt: {
  e?: Event;
  absolutePointer?: { x: number; y: number };
  scenePoint?: { x: number; y: number };
}) {
  if (!canvas || !textBoxDrawActive || !textBoxDrawStart || !textBoxDrawGuide) return;
  const p = scenePointFromEvent(opt);
  if (!p) return;
  const left = Math.min(textBoxDrawStart.x, p.x);
  const top = Math.min(textBoxDrawStart.y, p.y);
  const width = Math.max(1, Math.abs(p.x - textBoxDrawStart.x));
  const height = Math.max(1, Math.abs(p.y - textBoxDrawStart.y));
  textBoxDrawGuide.set({ left, top, width, height, originX: 'left', originY: 'top' });
  textBoxDrawGuide.setCoords();
  canvas.requestRenderAll();
}

function onTextBoxMouseUp(opt: {
  e?: Event;
  absolutePointer?: { x: number; y: number };
  scenePoint?: { x: number; y: number };
}) {
  if (!canvas || !textBoxDrawActive || !textBoxDrawStart) return;
  const p = scenePointFromEvent(opt);
  const end = p || textBoxDrawStart;
  const left = Math.min(textBoxDrawStart.x, end.x);
  const top = Math.min(textBoxDrawStart.y, end.y);
  let width = Math.abs(end.x - textBoxDrawStart.x);
  let height = Math.abs(end.y - textBoxDrawStart.y);

  // Tiny click → default size box anchored at click point
  if (width < 24) width = 160;
  if (height < 20) height = 48;

  if (textBoxDrawGuide) {
    batchMode = true;
    canvas.remove(textBoxDrawGuide);
    batchMode = false;
    textBoxDrawGuide = null;
  }

  // Clear draw mode before enterEditing so selection/cursors restore cleanly
  const startSnapshot = textBoxDrawStart;
  textBoxDrawStart = null;
  textBoxDrawActive = false;
  if (canvas) {
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
    canvas.selection = true;
    canvas.skipTargetFind = false;
  }
  void startSnapshot;

  const box = createTextBoxAt(left, top, width, height);
  if (box) {
    canvas.setActiveObject(box);
    canvas.requestRenderAll();
    // Defer editing one frame so layout/offset settle after draw mode ends
    requestAnimationFrame(() => {
      try {
        // Keep hidden textarea from scrolling the app shell into view
        pinFabricTextarea(box);
        box.enterEditing();
        box.selectAll();
      } catch {
        /* ignore */
      }
      listeners.onSelection?.();
    });
  } else {
    canvas.requestRenderAll();
  }
}

function ensureTextBoxDrawHandlers() {
  if (!canvas || textBoxHandlersBound) return;
  textBoxHandlersBound = true;
  canvas.on('mouse:down', onTextBoxMouseDown);
  canvas.on('mouse:move', onTextBoxMouseMove);
  canvas.on('mouse:up', onTextBoxMouseUp);
}

/** Shared off-screen host so fabric’s editing <textarea> never expands/scrolls layout. */
let fabricTextareaHost: HTMLDivElement | null = null;

function getFabricTextareaHost(): HTMLDivElement {
  if (fabricTextareaHost && fabricTextareaHost.isConnected) return fabricTextareaHost;
  const el = document.createElement('div');
  el.setAttribute('data-ba-fabric-textarea-host', '1');
  el.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none;z-index:-1;';
  document.body.appendChild(el);
  fabricTextareaHost = el;
  return el;
}

/** Pin the hidden editing field so focus cannot scroll the app shell. */
function pinFabricTextarea(obj: Textbox | IText) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyObj = obj as any;
  anyObj.hiddenTextareaContainer = getFabricTextareaHost();
  const ta = anyObj.hiddenTextarea as HTMLTextAreaElement | null | undefined;
  if (ta) {
    ta.style.position = 'fixed';
    ta.style.left = '0px';
    ta.style.top = '0px';
    ta.style.width = '1px';
    ta.style.height = '1px';
    ta.style.opacity = '0';
    ta.style.padding = '0';
    ta.style.margin = '0';
    ta.style.border = 'none';
    ta.style.overflow = 'hidden';
    ta.setAttribute('aria-hidden', 'true');
  }
}

/** Equal inset on all sides so text doesn’t hug the border (Fabric Textbox padding). */
export const TEXT_BOX_PADDING = 12;

function createTextBoxAt(
  left: number,
  top: number,
  width: number,
  height: number,
  text = 'Text',
): Textbox | null {
  if (!canvas) return null;
  const pad = TEXT_BOX_PADDING;
  // Drawn size is outer box; keep a usable min so padding still leaves room for text
  const w = Math.max(48, width);
  const h = Math.max(36, height);
  const box = new Textbox(text, {
    left,
    top,
    width: w,
    // Critical: Fabric 7 defaults to center origin — without left/top the box
    // is centered on the click instead of growing from the drag origin.
    originX: 'left',
    originY: 'top',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 20,
    fill: DEEP_BLACK,
    // Box fill (Object._renderBackground); empty = transparent
    backgroundColor: '',
    // Box border (repurposed via Textbox prototype patch above)
    stroke: '#000000',
    strokeWidth: 1.5,
    strokeUniform: true,
    editable: true,
    splitByGrapheme: false,
    textAlign: 'left',
    // Equal narrow margins: top / right / bottom / left
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...({ padding: pad } as { padding: number }),
  });
  // Host for hidden textarea before first edit (avoids layout scroll on focus)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (box as any).hiddenTextareaContainer = getFabricTextareaHost();
  ensureMeta(box, 'Text box');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (box as any).baTextBox = true;
  // Keep drawn height until user enables “Fit to text”
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (box as any).baMinHeight = h;
  if (typeof (box as Textbox).initDimensions === 'function') {
    (box as Textbox).initDimensions();
  }
  // ensureMeta may set control padding — re-apply equal text inset after
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (box as any).set({ padding: pad });
  box.setCoords();
  canvas.add(box);
  return box;
}

/**
 * Enter click-drag mode: draw a rectangle, then create a bordered Textbox.
 * Escape cancels. Call from the Text panel “Add text box” button.
 */
export function beginTextBoxDraw(): void {
  if (!canvas) return;
  ensureTextBoxDrawHandlers();
  finishTextBoxDraw();
  textBoxDrawActive = true;
  canvas.discardActiveObject();
  canvas.selection = false;
  canvas.skipTargetFind = true;
  canvas.defaultCursor = 'crosshair';
  canvas.hoverCursor = 'crosshair';
  canvas.requestRenderAll();
}

export function cancelTextBoxDraw(): void {
  finishTextBoxDraw();
}

export function isTextBoxDrawActive(): boolean {
  return textBoxDrawActive;
}

/** Place a default text box at artboard center (no drag). */
export function addTextBox(text = 'Text') {
  if (!canvas) return null;
  const w = 180;
  const h = 56;
  const box = createTextBoxAt(ARTBOARD_W / 2 - w / 2, ARTBOARD_H / 2 - h / 2, w, h, text);
  if (!box) return null;
  canvas.setActiveObject(box);
  canvas.requestRenderAll();
  try {
    box.enterEditing();
    box.selectAll();
  } catch {
    /* ignore */
  }
  return box;
}

/**
 * Shrink text box to hug current text: width fits longest line, height follows lines
 * (clears the drawn min-height so the border snaps to the text).
 */
export function fitTextBoxToContent(): boolean {
  if (!canvas) return false;
  const active = canvas.getActiveObjects().filter((o) => {
    const t = (o.type || '').toLowerCase();
    return t === 'textbox' || isBaTextBox(o);
  });
  if (!active.length) return false;
  try {
    active.forEach((obj) => {
      const tb = obj as Textbox & { baMinHeight?: number; padding?: number };
      // Drop fixed min height so height hugs text
      tb.baMinHeight = undefined;
      // Measure natural text width (unwrapped preference: current wrap width content)
      const measured =
        typeof tb.calcTextWidth === 'function' ? tb.calcTextWidth() : tb.width || 80;
      const pad = typeof tb.padding === 'number' ? tb.padding * 2 : 16;
      const nextW = Math.max(40, Math.ceil(measured + pad + 4));
      tb.set({ width: nextW });
      if (typeof tb.initDimensions === 'function') tb.initDimensions();
      tb.setCoords();
    });
    canvas.requestRenderAll();
    listeners.onSelection?.();
    scheduleHistoryPush();
    return true;
  } catch (err) {
    console.warn('[fitTextBoxToContent]', err);
    return false;
  }
}

export function addShape(kind: ShapeKind) {
  if (!canvas) return;
  const cx = ARTBOARD_W / 2;
  const cy = ARTBOARD_H / 2;
  const base = {
    left: cx,
    top: cy,
    originX: 'center' as const,
    originY: 'center' as const,
    fill: SHAPE_FILL,
    stroke: SHAPE_STROKE,
    strokeWidth: 2,
  };

  let obj: FabricObject;
  let name = 'Shape';

  switch (kind) {
    case 'rect':
      obj = new Rect({ ...base, width: 130, height: 80, rx: 0, ry: 0 });
      name = 'Rectangle';
      break;
    case 'roundRect':
      obj = new Rect({ ...base, width: 130, height: 80, rx: 16, ry: 16 });
      name = 'Rounded rectangle';
      break;
    case 'ellipse':
      obj = new Ellipse({ ...base, rx: 70, ry: 42 });
      name = 'Oval';
      break;
    case 'circle':
      obj = new Circle({ ...base, radius: 50 });
      name = 'Circle';
      break;
    case 'triangle':
      obj = new Triangle({ ...base, width: 110, height: 95 });
      name = 'Triangle';
      break;
    case 'rightTriangle':
      obj = new Polygon(
        [
          { x: -55, y: 48 },
          { x: -55, y: -48 },
          { x: 55, y: 48 },
        ],
        { ...base },
      );
      name = 'Right triangle';
      break;
    case 'diamond':
      obj = new Polygon(
        [
          { x: 0, y: -55 },
          { x: 50, y: 0 },
          { x: 0, y: 55 },
          { x: -50, y: 0 },
        ],
        { ...base },
      );
      name = 'Diamond';
      break;
    case 'pentagon':
      obj = new Polygon(regularPolygon(5, 52), { ...base });
      name = 'Pentagon';
      break;
    case 'hexagon':
      obj = new Polygon(regularPolygon(6, 50), { ...base });
      name = 'Hexagon';
      break;
    case 'star':
      obj = new Polygon(starPoints(5, 52, 24), { ...base });
      name = 'Star';
      break;
    case 'arrowBlock':
      obj = new Polygon(
        [
          { x: -60, y: -22 },
          { x: 20, y: -22 },
          { x: 20, y: -42 },
          { x: 60, y: 0 },
          { x: 20, y: 42 },
          { x: 20, y: 22 },
          { x: -60, y: 22 },
        ],
        { ...base },
      );
      name = 'Block arrow';
      break;
    case 'chevron':
      obj = new Polygon(
        [
          { x: -50, y: -35 },
          { x: 15, y: -35 },
          { x: 50, y: 0 },
          { x: 15, y: 35 },
          { x: -50, y: 35 },
          { x: -15, y: 0 },
        ],
        { ...base },
      );
      name = 'Chevron';
      break;
    case 'trapezoid':
      obj = new Polygon(
        [
          { x: -35, y: -40 },
          { x: 35, y: -40 },
          { x: 55, y: 40 },
          { x: -55, y: 40 },
        ],
        { ...base },
      );
      name = 'Trapezoid';
      break;
    case 'parallelogram':
      obj = new Polygon(
        [
          { x: -35, y: -40 },
          { x: 55, y: -40 },
          { x: 35, y: 40 },
          { x: -55, y: 40 },
        ],
        { ...base },
      );
      name = 'Parallelogram';
      break;
    case 'cross':
      obj = new Polygon(
        [
          { x: -16, y: -50 },
          { x: 16, y: -50 },
          { x: 16, y: -16 },
          { x: 50, y: -16 },
          { x: 50, y: 16 },
          { x: 16, y: 16 },
          { x: 16, y: 50 },
          { x: -16, y: 50 },
          { x: -16, y: 16 },
          { x: -50, y: 16 },
          { x: -50, y: -16 },
          { x: -16, y: -16 },
        ],
        { ...base },
      );
      name = 'Cross';
      break;
    case 'callout':
      obj = new Path(
        'M -55 -35 Q -55 -50 -35 -50 L 35 -50 Q 55 -50 55 -35 L 55 20 Q 55 35 35 35 L 10 35 L 0 55 L -5 35 L -35 35 Q -55 35 -55 20 Z',
        { ...base },
      );
      name = 'Callout';
      break;
    default:
      obj = new Rect({ ...base, width: 100, height: 70 });
      name = 'Shape';
  }

  placeShape(obj, name);
}

function lineDash(kind: LineKind): number[] | undefined {
  switch (kind) {
    case 'dashed':
    case 'arrowDashed':
    case 'arrowDoubleDashed':
    case 'curveDashed':
      return [12, 8];
    case 'dotted':
    case 'arrowDotted':
    case 'curveDotted':
      return [2, 6];
    case 'dashDot':
    case 'arrowDashDot':
      return [12, 6, 2, 6];
    default:
      return undefined;
  }
}

function arrowHead(x: number, y: number, angleDeg: number, color: string) {
  return new Triangle({
    width: 14,
    height: 16,
    fill: color,
    left: x,
    top: y,
    originX: 'center',
    originY: 'center',
    angle: angleDeg,
  });
}

export function addLine(kind: LineKind) {
  if (!canvas) return;
  const cx = ARTBOARD_W / 2;
  const cy = ARTBOARD_H / 2;
  const stroke = LINE_STROKE;
  const dash = lineDash(kind);
  const thick = kind === 'thick' ? 5 : kind === 'doubleLine' ? 2 : 2.5;

  let obj: FabricObject;
  let name = 'Line';

  const hLine = (x1: number, y1: number, x2: number, y2: number, extra: Record<string, unknown> = {}) =>
    new Line([x1, y1, x2, y2], {
      stroke,
      strokeWidth: thick,
      strokeDashArray: dash,
      strokeLineCap: kind.includes('dotted') || kind === 'dotted' ? 'round' : 'butt',
      ...extra,
    });

  switch (kind) {
    case 'solid':
    case 'dashed':
    case 'dotted':
    case 'dashDot':
    case 'thick':
      obj = hLine(cx - 90, cy, cx + 90, cy);
      name =
        kind === 'solid'
          ? 'Solid line'
          : kind === 'dashed'
            ? 'Dashed line'
            : kind === 'dotted'
              ? 'Dotted line'
              : kind === 'dashDot'
                ? 'Dash-dot line'
                : 'Thick line';
      break;

    case 'doubleLine': {
      const a = hLine(cx - 90, cy - 4, cx + 90, cy - 4);
      const b = hLine(cx - 90, cy + 4, cx + 90, cy + 4);
      obj = new Group([a, b], { left: cx, top: cy, originX: 'center', originY: 'center' });
      name = 'Double line';
      break;
    }

    case 'arrowEnd': {
      const shaft = hLine(0, 0, 160, 0);
      const head = arrowHead(160, 0, 90, stroke);
      obj = new Group([shaft, head], { left: cx, top: cy, originX: 'center', originY: 'center' });
      name = 'Arrow';
      break;
    }
    case 'arrowStart': {
      const shaft = hLine(0, 0, 160, 0);
      const head = arrowHead(0, 0, -90, stroke);
      obj = new Group([shaft, head], { left: cx, top: cy, originX: 'center', originY: 'center' });
      name = 'Arrow (start)';
      break;
    }
    case 'arrowDouble': {
      const shaft = hLine(0, 0, 160, 0);
      const h1 = arrowHead(0, 0, -90, stroke);
      const h2 = arrowHead(160, 0, 90, stroke);
      obj = new Group([shaft, h1, h2], { left: cx, top: cy, originX: 'center', originY: 'center' });
      name = 'Double arrow';
      break;
    }
    case 'arrowDashed':
    case 'arrowDotted':
    case 'arrowDashDot': {
      const shaft = hLine(0, 0, 160, 0);
      const head = arrowHead(160, 0, 90, stroke);
      obj = new Group([shaft, head], { left: cx, top: cy, originX: 'center', originY: 'center' });
      name =
        kind === 'arrowDashed'
          ? 'Dashed arrow'
          : kind === 'arrowDotted'
            ? 'Dotted arrow'
            : 'Dash-dot arrow';
      break;
    }
    case 'arrowDoubleDashed': {
      const shaft = hLine(0, 0, 160, 0);
      const h1 = arrowHead(0, 0, -90, stroke);
      const h2 = arrowHead(160, 0, 90, stroke);
      obj = new Group([shaft, h1, h2], { left: cx, top: cy, originX: 'center', originY: 'center' });
      name = 'Double dashed arrow';
      break;
    }

    case 'curve':
    case 'curveDashed':
    case 'curveDotted': {
      obj = new Path('M 0 40 Q 80 -40 160 40', {
        left: cx,
        top: cy,
        originX: 'center',
        originY: 'center',
        fill: '',
        stroke,
        strokeWidth: thick,
        strokeDashArray: dash,
        strokeLineCap: 'round',
      });
      name =
        kind === 'curve' ? 'Curve' : kind === 'curveDashed' ? 'Dashed curve' : 'Dotted curve';
      break;
    }
    case 'curveArrow': {
      const curve = new Path('M 0 40 Q 80 -40 150 40', {
        fill: '',
        stroke,
        strokeWidth: thick,
        strokeLineCap: 'round',
      });
      const head = arrowHead(150, 40, 55, stroke);
      obj = new Group([curve, head], { left: cx, top: cy, originX: 'center', originY: 'center' });
      name = 'Curved arrow';
      break;
    }

    case 'elbow': {
      obj = new Polyline(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 70 },
        ],
        {
          left: cx,
          top: cy,
          originX: 'center',
          originY: 'center',
          fill: '',
          stroke,
          strokeWidth: thick,
        },
      );
      name = 'Elbow line';
      break;
    }
    case 'elbowArrow': {
      const poly = new Polyline(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 60 },
        ],
        { fill: '', stroke, strokeWidth: thick },
      );
      const head = arrowHead(100, 60, 180, stroke);
      obj = new Group([poly, head], { left: cx, top: cy, originX: 'center', originY: 'center' });
      name = 'Elbow arrow';
      break;
    }

    case 'inhibit': {
      const shaft = hLine(0, 0, 150, 0);
      const bar = new Line([150, -14, 150, 14], { stroke, strokeWidth: 3 });
      obj = new Group([shaft, bar], { left: cx, top: cy, originX: 'center', originY: 'center' });
      name = 'Inhibition (T-bar)';
      break;
    }

    default:
      obj = hLine(cx - 80, cy, cx + 80, cy);
      name = 'Line';
  }

  placeShape(obj, name);
}

// ─── Reaction arrow + reagent labels ─────────────────────────────────────────

/** Vertical gap from arrow centerline to each label center (px) — equidistant top/bottom. */
const REAGENT_LABEL_GAP = 34;
const REACTION_ARROW_LEN = 180;

function makeStraightArrowGroup(cx: number, cy: number, len = REACTION_ARROW_LEN): Group {
  const stroke = LINE_STROKE;
  const shaft = new Line([0, 0, len, 0], {
    stroke,
    strokeWidth: 3.5,
    strokeLineCap: 'butt',
  });
  const head = new Triangle({
    width: 18,
    height: 20,
    fill: stroke,
    left: len,
    top: 0,
    originX: 'center',
    originY: 'center',
    angle: 90,
  });
  return new Group([shaft, head], {
    left: cx,
    top: cy,
    originX: 'center',
    originY: 'center',
  });
}

function makeReagentLabel(
  text: string,
  left: number,
  top: number,
  name: string,
): IText {
  const t = new IText(text, {
    left,
    top,
    originX: 'center',
    originY: 'center',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 15,
    fontStyle: 'italic',
    fill: DEEP_BLACK,
    textAlign: 'center',
    editable: true,
  });
  ensureMeta(t, name);
  return t;
}

function tagReaction(obj: FabricObject, reactionId: string, slot: 'arrow' | 'top' | 'bottom') {
  const o = asBa(obj);
  o.baReactionId = reactionId;
  o.baReagentSlot = slot;
}

/**
 * Place a straight reaction arrow with top + bottom reagent text boxes,
 * centered on the arrow and equidistant above/below.
 * Boxes are independent objects (move / delete separately). Double-click to edit.
 */
export function addReactionArrowWithReagents(opts?: {
  left?: number;
  top?: number;
  topText?: string;
  bottomText?: string;
}): void {
  if (!canvas) return;
  const cx = opts?.left ?? ARTBOARD_W / 2;
  const cy = opts?.top ?? ARTBOARD_H / 2;
  const reactionId = uid();

  withHistory(() => {
    const arrow = makeStraightArrowGroup(cx, cy);
    ensureMeta(arrow, 'Reaction arrow');
    tagReaction(arrow, reactionId, 'arrow');

    const top = makeReagentLabel(
      opts?.topText ?? 'reagent',
      cx,
      cy - REAGENT_LABEL_GAP,
      'Reagent (top)',
    );
    tagReaction(top, reactionId, 'top');

    const bottom = makeReagentLabel(
      opts?.bottomText ?? 'condition',
      cx,
      cy + REAGENT_LABEL_GAP,
      'Condition (bottom)',
    );
    tagReaction(bottom, reactionId, 'bottom');

    canvas!.add(arrow);
    canvas!.add(top);
    canvas!.add(bottom);

    // Select all three so user can move the assembly as a unit first
    try {
      const sel = new ActiveSelection([arrow, top, bottom], { canvas: canvas! });
      canvas!.setActiveObject(sel);
    } catch {
      canvas!.setActiveObject(arrow);
    }
    // Ensure artboard is in view (avoid “where did it go?” when pan/zoom was changed)
    try {
      canvas!.setViewportTransform([1, 0, 0, 1, 0, 0] as TMat2D);
      canvas!.setZoom(1);
      listeners.onZoom?.(1);
    } catch {
      /* ignore */
    }
    canvas!.requestRenderAll();
  });
}

/**
 * Add top/bottom reagent labels to an already-selected arrow (or any object).
 * Labels are centered on the selection and equidistant above/below.
 */
export function addReagentsToSelectedArrow(opts?: {
  topText?: string;
  bottomText?: string;
}): boolean {
  if (!canvas) return false;
  const active = canvas.getActiveObject();
  if (!active || isActiveSelection(active)) return false;

  const center = active.getCenterPoint();
  const reactionId = asBa(active).baReactionId || uid();

  withHistory(() => {
    tagReaction(active, reactionId, asBa(active).baReagentSlot || 'arrow');
    if (!asBa(active).baName || asBa(active).baName === 'Arrow') {
      asBa(active).baName = 'Reaction arrow';
    }

    const top = makeReagentLabel(
      opts?.topText ?? 'reagent',
      center.x,
      center.y - REAGENT_LABEL_GAP,
      'Reagent (top)',
    );
    tagReaction(top, reactionId, 'top');

    const bottom = makeReagentLabel(
      opts?.bottomText ?? 'condition',
      center.x,
      center.y + REAGENT_LABEL_GAP,
      'Condition (bottom)',
    );
    tagReaction(bottom, reactionId, 'bottom');

    canvas!.add(top);
    canvas!.add(bottom);
    canvas!.setActiveObject(top);
    canvas!.requestRenderAll();
  });
  return true;
}

/**
 * Set user zoom (0.25–3). Fabric viewport stays identity; the React stage
 * applies CSS scale and grows so the workspace can scroll when zoomed in.
 *
 * @param anchorClient optional cursor position to keep under the pointer while zooming
 */
export function setZoom(
  zoom: number,
  anchorClient?: { clientX: number; clientY: number },
) {
  const z = Math.min(3, Math.max(0.25, zoom));
  const prev = userZoom;
  userZoom = z;

  // Keep fabric at identity — CSS + scroll own the view
  if (canvas) {
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0] as TMat2D);
    canvas.requestRenderAll();
  }

  listeners.onZoom?.(z);

  // After React reflows stage size, re-anchor scroll so zoom feels centered on cursor
  if (scrollEl && Math.abs(z - prev) > 0.0001) {
    const el = scrollEl;
    const ratio = z / (prev || 1);
    requestAnimationFrame(() => {
      if (!scrollEl) return;
      const rect = el.getBoundingClientRect();
      const ax = anchorClient
        ? anchorClient.clientX - rect.left
        : rect.width / 2;
      const ay = anchorClient
        ? anchorClient.clientY - rect.top
        : rect.height / 2;
      // Content point under anchor before zoom → keep under anchor after
      const contentX = el.scrollLeft + ax;
      const contentY = el.scrollTop + ay;
      el.scrollLeft = contentX * ratio - ax;
      el.scrollTop = contentY * ratio - ay;
    });
  }
}

export function getZoom() {
  return userZoom;
}

export function zoomBy(delta: number) {
  setZoom(getZoom() + delta);
}

/**
 * Reset pan/zoom so the full artboard is visible (CSS fit-scale still applies).
 */
export function fitToScreen() {
  userZoom = 1;
  if (canvas) {
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0] as TMat2D);
    canvas.requestRenderAll();
  }
  if (scrollEl) {
    // Center artboard in the scrollport after reflow
    requestAnimationFrame(() => {
      if (!scrollEl) return;
      const maxX = scrollEl.scrollWidth - scrollEl.clientWidth;
      const maxY = scrollEl.scrollHeight - scrollEl.clientHeight;
      scrollEl.scrollLeft = Math.max(0, maxX / 2);
      scrollEl.scrollTop = Math.max(0, maxY / 2);
    });
  }
  listeners.onZoom?.(1);
}

/**
 * Scale factor so artboard fits inside a workspace box (≤ 1 = never upscale past 100%).
 * padY leaves room for the favorites dock when open.
 */
export function computeFitScale(
  containerW: number,
  containerH: number,
  artW = ARTBOARD_W,
  artH = ARTBOARD_H,
  padX = 24,
  padY = 100,
): number {
  if (containerW <= 0 || containerH <= 0 || artW <= 0 || artH <= 0) return 1;
  const availW = Math.max(40, containerW - padX);
  const availH = Math.max(40, containerH - padY);
  const s = Math.min(availW / artW, availH / artH, 1);
  return Math.max(0.08, Math.min(1, s));
}

/**
 * Convert client coordinates to canvas scene coordinates.
 * Uses the element's getBoundingClientRect so CSS display-scale is handled correctly.
 */
export function clientToScene(clientX: number, clientY: number, el: HTMLElement): { x: number; y: number } {
  if (!canvas) return { x: ARTBOARD_W / 2, y: ARTBOARD_H / 2 };
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: ARTBOARD_W / 2, y: ARTBOARD_H / 2 };
  }
  // Map through displayed (CSS-scaled + scrolled) box → artboard scene pixels.
  // Fabric viewport is kept at identity; pan is scroll, zoom is CSS scale.
  const localX = ((clientX - rect.left) / rect.width) * ARTBOARD_W;
  const localY = ((clientY - rect.top) / rect.height) * ARTBOARD_H;
  return { x: localX, y: localY };
}

export function clearCanvas() {
  if (!canvas) return;
  historyLock = true;
  try {
    canvas.clear();
    canvas.backgroundColor = '#ffffff';
    canvas.requestRenderAll();
  } finally {
    historyLock = false;
  }
  // Fresh history for a blank document
  history = [JSON.stringify(canvasJSON())];
  historyIndex = 0;
  listeners.onHistory?.(false, false);
  listeners.onLayers?.();
  listeners.onSelection?.();
  notifyObjectCount();
}

export function getObjectCount() {
  return canvas?.getObjects().length ?? 0;
}

export function exportJSON() {
  if (!canvas) return null;
  return {
    version: 1,
    artboard: { width: ARTBOARD_W, height: ARTBOARD_H },
    canvas: canvasJSON(),
  };
}

export async function importJSON(data: {
  canvas?: unknown;
  artboard?: { width: number; height: number };
}) {
  if (!canvas || !data.canvas) return;
  historyLock = true;
  try {
    if (data.artboard) {
      setArtboardSize(data.artboard.width, data.artboard.height);
    }
    await canvas.loadFromJSON(data.canvas);
    reinstallCropControlsOnAll();
    canvas.requestRenderAll();
  } finally {
    historyLock = false;
  }
  // Reset history so Undo cannot restore the previous document
  resetHistoryFromCurrent();
  listeners.onLayers?.();
  listeners.onSelection?.();
  notifyObjectCount();
}

/** Export at identity viewport so pan/zoom do not clip the artboard. */
function withIdentityViewport<T>(fn: () => T): T {
  if (!canvas) return fn();
  const prev = (canvas.viewportTransform || [1, 0, 0, 1, 0, 0]).slice() as TMat2D;
  const prevZoom = canvas.getZoom();
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0] as TMat2D);
  canvas.setZoom(1);
  canvas.requestRenderAll();
  try {
    return fn();
  } finally {
    canvas.setViewportTransform(prev);
    canvas.setZoom(prevZoom);
    canvas.requestRenderAll();
    // Do NOT notify onZoom — UI zoom is CSS userZoom, not fabric zoom
  }
}

/**
 * Raster export of the artboard at identity viewport.
 * multiplier scales output pixels (use ppi / DESIGN_DPI for print PPI).
 */
export function exportRaster(opts: {
  format?: 'png' | 'jpeg';
  multiplier?: number;
  quality?: number;
}): string {
  if (!canvas) return '';
  const format = opts.format === 'jpeg' ? 'jpeg' : 'png';
  const multiplier = Math.max(0.25, Math.min(10, opts.multiplier ?? 2));
  const quality = Math.max(0.1, Math.min(1, opts.quality ?? 1));
  return withIdentityViewport(() =>
    canvas!.toDataURL({
      format,
      multiplier,
      quality,
      // Multiplier fully controls resolution (avoid double-scaling on retina)
      enableRetinaScaling: false,
    }),
  );
}

/** @deprecated Prefer exportRaster */
export function exportPng(multiplier = 2): string {
  return exportRaster({ format: 'png', multiplier });
}

export function exportSvg(): string {
  if (!canvas) return '';
  return withIdentityViewport(() => canvas!.toSVG());
}

/**
 * Temporarily clear artboard fill for transparent PNG export, then restore.
 */
export function withTransparentBackground<T>(fn: () => T): T {
  if (!canvas) return fn();
  const prev = canvas.backgroundColor;
  try {
    canvas.backgroundColor = '';
    canvas.requestRenderAll();
    return fn();
  } finally {
    canvas.backgroundColor = prev;
    canvas.requestRenderAll();
  }
}

export async function fetchSvgText(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.text();
}
