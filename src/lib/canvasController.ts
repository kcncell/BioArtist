import {
  Canvas,
  Circle,
  Ellipse,
  FabricImage,
  FabricObject,
  Group,
  IText,
  Line,
  Path,
  Polygon,
  Polyline,
  Rect,
  Triangle,
  loadSVGFromString,
  type TMat2D,
} from 'fabric';
import type { LayerInfo, LineKind, SelectionProps, ShapeKind } from '../types';
import type { BaObject } from '../types';
import {
  bindAlignGuideHandlers,
  clearAlignGuides,
  resetAlignGuideHandlers,
} from './alignGuides';

// Persist BioArtist metadata across save/load and history
FabricObject.customProperties = ['baId', 'baName', 'baLocked'];

let ARTBOARD_W = 900;
let ARTBOARD_H = 600;

let canvas: Canvas | null = null;
let history: string[] = [];
let historyIndex = -1;
let historyLock = false;
/** When true, object:added/removed do not auto-push history (transactional ops). */
let batchMode = false;
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
  o.set({
    borderColor: '#8ec5ff',
    cornerColor: '#1a1c22',
    cornerStrokeColor: '#8ec5ff',
    cornerStyle: 'circle',
    transparentCorners: false,
    borderScaleFactor: 1.5,
    padding: 2,
  });
}

function guessName(obj: FabricObject): string {
  const t = (obj.type || 'object').toLowerCase();
  if (t === 'i-text' || t === 'textbox' || t === 'text') return 'Text';
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

  canvas.on('selection:created', () => listeners.onSelection?.());
  canvas.on('selection:updated', () => listeners.onSelection?.());
  canvas.on('selection:cleared', () => listeners.onSelection?.());
  canvas.on('object:modified', () => {
    listeners.onSelection?.();
    listeners.onLayers?.();
    if (!historyLock && !batchMode) pushHistory();
  });
  canvas.on('object:added', (e) => {
    if (e.target && !isActiveSelection(e.target)) ensureMeta(e.target);
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
    canvas.requestRenderAll();
  } finally {
    historyLock = false;
  }
  listeners.onLayers?.();
  listeners.onSelection?.();
  notifyObjectCount();
  listeners.onHistory?.(historyIndex > 0, historyIndex < history.length - 1);
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
  const fill = typeof obj.fill === 'string' ? obj.fill : '#8ec5ff';
  const stroke = typeof obj.stroke === 'string' ? obj.stroke : '#111827';
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
      isText:
        (obj.type || '').toLowerCase() === 'i-text' ||
        (obj.type || '').toLowerCase() === 'textbox' ||
        (obj.type || '').toLowerCase() === 'text',
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
  const obj = canvas.getActiveObject();
  if (!obj || isActiveSelection(obj)) return;
  canvas.bringObjectForward(obj);
  canvas.requestRenderAll();
  listeners.onLayers?.();
  pushHistory();
}

export function sendBackward() {
  if (!canvas) return;
  const obj = canvas.getActiveObject();
  if (!obj || isActiveSelection(obj)) return;
  canvas.sendObjectBackwards(obj);
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
  const obj = canvas.getActiveObject();
  if (!obj || isActiveSelection(obj)) return;
  canvas.bringObjectToFront(obj);
  canvas.requestRenderAll();
  listeners.onLayers?.();
  pushHistory();
}

export function sendToBack() {
  if (!canvas) return;
  const obj = canvas.getActiveObject();
  if (!obj || isActiveSelection(obj)) return;
  canvas.sendObjectToBack(obj);
  canvas.requestRenderAll();
  listeners.onLayers?.();
  pushHistory();
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

export function panBy(dx: number, dy: number) {
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

function setFillRecursive(obj: FabricObject, fill: string) {
  const anyObj = obj as FabricObject & { _objects?: FabricObject[] };
  if (anyObj._objects && Array.isArray(anyObj._objects)) {
    anyObj._objects.forEach((child) => setFillRecursive(child, fill));
  }
  const current = obj.fill;
  const t = (obj.type || '').toLowerCase();
  if (current && current !== 'none' && typeof current === 'string') {
    obj.set('fill', fill);
  } else if (['rect', 'ellipse', 'circle', 'triangle', 'polygon', 'i-text', 'textbox', 'text'].includes(t)) {
    obj.set('fill', fill);
  } else if (t === 'path' && current && current !== 'none') {
    obj.set('fill', fill);
  }
}

function setStrokeRecursive(obj: FabricObject, stroke: string) {
  const anyObj = obj as FabricObject & { _objects?: FabricObject[] };
  if (anyObj._objects && Array.isArray(anyObj._objects)) {
    anyObj._objects.forEach((child) => setStrokeRecursive(child, stroke));
  }
  const current = obj.stroke;
  if (current && current !== 'none') {
    obj.set('stroke', stroke);
  } else if (['line', 'rect', 'ellipse', 'circle', 'path'].includes((obj.type || '').toLowerCase())) {
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

export async function addSvgToCanvas(
  svgText: string,
  opts?: { left?: number; top?: number; name?: string; maxSize?: number },
) {
  if (!canvas) return null;
  const { objects } = await loadSVGFromString(svgText);
  const valid = (objects || []).filter(Boolean) as FabricObject[];
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

const SHAPE_FILL = 'rgba(142, 197, 255, 0.18)';
const SHAPE_STROKE = '#8ec5ff';
const LINE_STROKE = '#e5e7eb';

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

export function addText(text = 'Label') {
  if (!canvas) return;
  const t = new IText(text, {
    left: ARTBOARD_W / 2,
    top: ARTBOARD_H / 2,
    originX: 'center',
    originY: 'center',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 24,
    fill: '#f0f2f5',
    editable: true,
  });
  ensureMeta(t, 'Text');
  canvas.add(t);
  canvas.setActiveObject(t);
  canvas.requestRenderAll();
  t.enterEditing();
  t.selectAll();
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

export function setZoom(zoom: number) {
  if (!canvas) return;
  const z = Math.min(3, Math.max(0.25, zoom));
  const center = canvas.getCenterPoint();
  canvas.zoomToPoint(center, z);
  canvas.requestRenderAll();
  listeners.onZoom?.(z);
}

export function getZoom() {
  return canvas?.getZoom() ?? 1;
}

export function zoomBy(delta: number) {
  setZoom(getZoom() + delta);
}

/**
 * Reset pan/zoom to identity so the full artboard is visible.
 * Display scaling (fit into the workspace) is handled in FabricCanvas via CSS.
 */
export function fitToScreen() {
  if (!canvas) return;
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0] as TMat2D);
  canvas.setZoom(1);
  canvas.requestRenderAll();
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
  // Map through displayed (possibly CSS-scaled) box → artboard pixels
  const localX = ((clientX - rect.left) / rect.width) * ARTBOARD_W;
  const localY = ((clientY - rect.top) / rect.height) * ARTBOARD_H;
  // Then undo fabric viewport (zoom + pan)
  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  const zoom = vpt[0] || canvas.getZoom() || 1;
  const x = (localX - vpt[4]) / zoom;
  const y = (localY - vpt[5]) / zoom;
  return { x, y };
}

export function clearCanvas() {
  if (!canvas) return;
  withHistory(() => {
    canvas!.clear();
    canvas!.backgroundColor = '#ffffff';
    canvas!.requestRenderAll();
  });
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
    listeners.onZoom?.(prevZoom);
  }
}

export function exportPng(multiplier = 2): string {
  if (!canvas) return '';
  return withIdentityViewport(() =>
    canvas!.toDataURL({
      format: 'png',
      multiplier,
      enableRetinaScaling: true,
    }),
  );
}

export function exportSvg(): string {
  if (!canvas) return '';
  return withIdentityViewport(() => canvas!.toSVG());
}

export async function fetchSvgText(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.text();
}
