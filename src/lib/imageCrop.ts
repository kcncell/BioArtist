/**
 * Canva-style reshape + crop for figures and pictures.
 *
 * - Corner handles: proportional scale (reshape) — Fabric default
 * - Side handles: crop from that edge
 * - Right-click “Crop”: dedicated crop mode (larger side handles, Esc to finish)
 *
 * Images use native cropX/cropY/width/height.
 * Groups / paths use a rectangular clipPath.
 */
import {
  Control,
  FabricImage,
  FabricObject,
  Rect,
  controlsUtils,
  type TPointerEvent,
  type Transform,
} from 'fabric';

export type BaCropInsets = {
  /** Cropped away from left (source / unscaled units) */
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** Full uncropped size in source units */
  baseW: number;
  baseH: number;
};

const MIN_VISIBLE = 12;

type CropSide = 'left' | 'right' | 'top' | 'bottom';

let cropModeTarget: FabricObject | null = null;

export function isCropModeActive(): boolean {
  return !!cropModeTarget;
}

export function getCropModeTarget(): FabricObject | null {
  return cropModeTarget;
}

export function isCroppable(obj: FabricObject | null | undefined): boolean {
  if (!obj) return false;
  const t = (obj.type || '').toLowerCase();
  if (t === 'activeselection') return false;
  if (t === 'i-text' || t === 'textbox' || t === 'text') return false;
  if (t === 'line' || t === 'polyline') return false;
  if (t === 'image') return true;
  if (t === 'group') return true;
  if (t === 'path') return true;
  // Raster-like custom
  if (obj instanceof FabricImage) return true;
  return false;
}

function isImage(obj: FabricObject): obj is FabricImage {
  return obj instanceof FabricImage || (obj.type || '').toLowerCase() === 'image';
}

function getNaturalSize(obj: FabricObject): { w: number; h: number } {
  if (isImage(obj)) {
    const el =
      typeof obj.getElement === 'function'
        ? obj.getElement()
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (obj as any)._element;
    if (el) {
      const w =
        (el as HTMLImageElement).naturalWidth ||
        (el as HTMLCanvasElement).width ||
        obj.width ||
        1;
      const h =
        (el as HTMLImageElement).naturalHeight ||
        (el as HTMLCanvasElement).height ||
        obj.height ||
        1;
      return { w: Math.max(1, w), h: Math.max(1, h) };
    }
  }
  return { w: Math.max(1, obj.width || 1), h: Math.max(1, obj.height || 1) };
}

export function ensureCropState(obj: FabricObject): BaCropInsets {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let c = (obj as any).baCrop as BaCropInsets | undefined;
  if (c && c.baseW > 0 && c.baseH > 0) return c;
  const { w, h } = getNaturalSize(obj);
  // If image already has crop applied, seed from that
  if (isImage(obj)) {
    const cropX = obj.cropX || 0;
    const cropY = obj.cropY || 0;
    const visW = obj.width || w;
    const visH = obj.height || h;
    c = {
      left: cropX,
      top: cropY,
      right: Math.max(0, w - cropX - visW),
      bottom: Math.max(0, h - cropY - visH),
      baseW: w,
      baseH: h,
    };
  } else {
    c = { left: 0, top: 0, right: 0, bottom: 0, baseW: w, baseH: h };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (obj as any).baCrop = c;
  return c;
}

function clampInsets(c: BaCropInsets): void {
  const maxL = Math.max(0, c.baseW - c.right - MIN_VISIBLE);
  const maxT = Math.max(0, c.baseH - c.bottom - MIN_VISIBLE);
  c.left = Math.max(0, Math.min(c.left, maxL));
  c.top = Math.max(0, Math.min(c.top, maxT));
  const maxR = Math.max(0, c.baseW - c.left - MIN_VISIBLE);
  const maxB = Math.max(0, c.baseH - c.top - MIN_VISIBLE);
  c.right = Math.max(0, Math.min(c.right, maxR));
  c.bottom = Math.max(0, Math.min(c.bottom, maxB));
}

/** Apply crop insets to visual + hit box. */
export function applyCropToObject(obj: FabricObject): void {
  const c = ensureCropState(obj);
  clampInsets(c);

  if (isImage(obj)) {
    const visW = Math.max(MIN_VISIBLE, c.baseW - c.left - c.right);
    const visH = Math.max(MIN_VISIBLE, c.baseH - c.top - c.bottom);
    obj.set({
      cropX: c.left,
      cropY: c.top,
      width: visW,
      height: visH,
    });
    obj.setCoords();
    obj.dirty = true;
    return;
  }

  // Group / path: rectangular clipPath in object-local space (origin center)
  const visW = Math.max(MIN_VISIBLE, c.baseW - c.left - c.right);
  const visH = Math.max(MIN_VISIBLE, c.baseH - c.top - c.bottom);
  const cx = (c.left - c.right) / 2;
  const cy = (c.top - c.bottom) / 2;
  const clip = new Rect({
    left: cx,
    top: cy,
    width: visW,
    height: visH,
    originX: 'center',
    originY: 'center',
    absolutePositioned: false,
  });
  obj.clipPath = clip;
  obj.dirty = true;
  obj.setCoords();
}

export function resetCrop(obj: FabricObject): void {
  const { w, h } = getNaturalSize(obj);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (obj as any).baCrop = {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    baseW: w,
    baseH: h,
  };
  if (isImage(obj)) {
    obj.set({ cropX: 0, cropY: 0, width: w, height: h });
  } else {
    obj.clipPath = undefined;
  }
  obj.dirty = true;
  obj.setCoords();
}

/**
 * Crop from one side by moving that edge to `localX/localY` (object-local, origin center).
 * Adjusts object position so the opposite edge stays fixed on the canvas.
 */
function cropSideToLocal(
  obj: FabricObject,
  side: CropSide,
  localX: number,
  localY: number,
): boolean {
  const c = ensureCropState(obj);
  const halfW = c.baseW / 2;
  const halfH = c.baseH / 2;
  const sx = obj.scaleX || 1;
  const sy = obj.scaleY || 1;
  const angle = ((obj.angle || 0) * Math.PI) / 180;

  // Current edges in local coords (origin = object center of full base)
  // For images, object center is center of *visible* crop box after crop is applied.
  // We recompute insets relative to full base by working in crop space.

  // For image with crop already applied, local coords from getLocalPoint are relative
  // to current (cropped) object dimensions. Convert carefully.

  if (isImage(obj)) {
    // Local coords: origin center of current visible width/height
    const visW = c.baseW - c.left - c.right;
    const visH = c.baseH - c.top - c.bottom;
    const halfVisW = visW / 2;
    const halfVisH = visH / 2;

    let changed = false;
    if (side === 'left') {
      // pointer from left of visible box
      const fromLeft = localX + halfVisW;
      const delta = fromLeft; // positive = shrink from left
      if (Math.abs(delta) < 0.01) return false;
      const newLeft = c.left + delta;
      const maxLeft = c.baseW - c.right - MIN_VISIBLE;
      const clamped = Math.max(0, Math.min(newLeft, maxLeft));
      const applied = clamped - c.left;
      if (Math.abs(applied) < 0.01) return false;
      c.left = clamped;
      // Shift center so right edge stays put (along object X)
      shiftObjectAlongLocal(obj, applied / 2, 0, sx, sy, angle);
      changed = true;
    } else if (side === 'right') {
      const fromRight = halfVisW - localX;
      const delta = fromRight;
      if (Math.abs(delta) < 0.01) return false;
      const newRight = c.right + delta;
      const maxRight = c.baseW - c.left - MIN_VISIBLE;
      const clamped = Math.max(0, Math.min(newRight, maxRight));
      const applied = clamped - c.right;
      if (Math.abs(applied) < 0.01) return false;
      c.right = clamped;
      shiftObjectAlongLocal(obj, -applied / 2, 0, sx, sy, angle);
      changed = true;
    } else if (side === 'top') {
      const fromTop = localY + halfVisH;
      const delta = fromTop;
      if (Math.abs(delta) < 0.01) return false;
      const newTop = c.top + delta;
      const maxTop = c.baseH - c.bottom - MIN_VISIBLE;
      const clamped = Math.max(0, Math.min(newTop, maxTop));
      const applied = clamped - c.top;
      if (Math.abs(applied) < 0.01) return false;
      c.top = clamped;
      shiftObjectAlongLocal(obj, 0, applied / 2, sx, sy, angle);
      changed = true;
    } else if (side === 'bottom') {
      const fromBottom = halfVisH - localY;
      const delta = fromBottom;
      if (Math.abs(delta) < 0.01) return false;
      const newBottom = c.bottom + delta;
      const maxBottom = c.baseH - c.top - MIN_VISIBLE;
      const clamped = Math.max(0, Math.min(newBottom, maxBottom));
      const applied = clamped - c.bottom;
      if (Math.abs(applied) < 0.01) return false;
      c.bottom = clamped;
      shiftObjectAlongLocal(obj, 0, -applied / 2, sx, sy, angle);
      changed = true;
    }
    if (changed) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (obj as any).baCrop = c;
      applyCropToObject(obj);
    }
    return changed;
  }

  // Group / path — work in base dimensions (clipPath space)
  let changed = false;
  if (side === 'left') {
    const inset = localX + halfW;
    const clamped = Math.max(0, Math.min(inset, c.baseW - c.right - MIN_VISIBLE));
    const applied = clamped - c.left;
    if (Math.abs(applied) < 0.01) return false;
    c.left = clamped;
    shiftObjectAlongLocal(obj, applied / 2, 0, sx, sy, angle);
    changed = true;
  } else if (side === 'right') {
    const inset = halfW - localX;
    const clamped = Math.max(0, Math.min(inset, c.baseW - c.left - MIN_VISIBLE));
    const applied = clamped - c.right;
    if (Math.abs(applied) < 0.01) return false;
    c.right = clamped;
    shiftObjectAlongLocal(obj, -applied / 2, 0, sx, sy, angle);
    changed = true;
  } else if (side === 'top') {
    const inset = localY + halfH;
    const clamped = Math.max(0, Math.min(inset, c.baseH - c.bottom - MIN_VISIBLE));
    const applied = clamped - c.top;
    if (Math.abs(applied) < 0.01) return false;
    c.top = clamped;
    shiftObjectAlongLocal(obj, 0, applied / 2, sx, sy, angle);
    changed = true;
  } else if (side === 'bottom') {
    const inset = halfH - localY;
    const clamped = Math.max(0, Math.min(inset, c.baseH - c.top - MIN_VISIBLE));
    const applied = clamped - c.bottom;
    if (Math.abs(applied) < 0.01) return false;
    c.bottom = clamped;
    shiftObjectAlongLocal(obj, 0, -applied / 2, sx, sy, angle);
    changed = true;
  }
  if (changed) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (obj as any).baCrop = c;
    applyCropToObject(obj);
  }
  return changed;
}

/** Move object center by local (dx,dy) accounting for scale + rotation. */
function shiftObjectAlongLocal(
  obj: FabricObject,
  dxLocal: number,
  dyLocal: number,
  sx: number,
  sy: number,
  angleRad: number,
) {
  const dx = dxLocal * sx;
  const dy = dyLocal * sy;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const sceneDx = dx * cos - dy * sin;
  const sceneDy = dx * sin + dy * cos;
  obj.set({
    left: (obj.left ?? 0) + sceneDx,
    top: (obj.top ?? 0) + sceneDy,
  });
}

function makeCropHandler(side: CropSide) {
  return (
    _eventData: TPointerEvent,
    transform: Transform,
    x: number,
    y: number,
  ): boolean => {
    const target = transform.target;
    if (!isCroppable(target)) return false;
    const local = controlsUtils.getLocalPoint(transform, 'center', 'center', x, y);
    const ok = cropSideToLocal(target, side, local.x, local.y);
    if (ok) {
      target.canvas?.requestRenderAll();
    }
    return ok;
  };
}

function renderCropBar(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: unknown,
  fabricObject: FabricObject,
  horizontal: boolean,
) {
  const size = fabricObject.cornerSize || 12;
  ctx.save();
  ctx.fillStyle = '#8ec5ff';
  ctx.strokeStyle = '#1a1c22';
  ctx.lineWidth = 1;
  if (horizontal) {
    const w = Math.max(18, size * 2.2);
    const h = Math.max(6, size * 0.55);
    ctx.beginPath();
    ctx.rect(left - w / 2, top - h / 2, w, h);
    ctx.fill();
    ctx.stroke();
  } else {
    const w = Math.max(6, size * 0.55);
    const h = Math.max(18, size * 2.2);
    ctx.beginPath();
    ctx.rect(left - w / 2, top - h / 2, w, h);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Install Canva-style controls: corners scale equally, sides crop.
 * Safe to call repeatedly (reassigns controls).
 */
export function installCropControls(obj: FabricObject): void {
  if (!isCroppable(obj)) return;

  const defaults = controlsUtils.createObjectDefaultControls();
  const inCropMode =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    !!(obj as any).baCropMode || cropModeTarget === obj;
  const barScale = inCropMode ? 1.35 : 1;

  // Corners stay proportional reshape
  const cornerHandler = controlsUtils.scalingEqually;
  const cornerCursor = controlsUtils.scaleCursorStyleHandler;

  obj.controls = {
    ...defaults,
    tl: new Control({
      x: -0.5,
      y: -0.5,
      cursorStyleHandler: cornerCursor,
      actionHandler: cornerHandler,
      actionName: 'scale',
    }),
    tr: new Control({
      x: 0.5,
      y: -0.5,
      cursorStyleHandler: cornerCursor,
      actionHandler: cornerHandler,
      actionName: 'scale',
    }),
    bl: new Control({
      x: -0.5,
      y: 0.5,
      cursorStyleHandler: cornerCursor,
      actionHandler: cornerHandler,
      actionName: 'scale',
    }),
    br: new Control({
      x: 0.5,
      y: 0.5,
      cursorStyleHandler: cornerCursor,
      actionHandler: cornerHandler,
      actionName: 'scale',
    }),
    // Sides = crop
    ml: new Control({
      x: -0.5,
      y: 0,
      actionName: 'crop',
      cursorStyle: 'ew-resize',
      actionHandler: makeCropHandler('left'),
      sizeX: 10 * barScale,
      sizeY: 22 * barScale,
      render: (ctx, left, top, style, fo) => renderCropBar(ctx, left, top, style, fo, false),
    }),
    mr: new Control({
      x: 0.5,
      y: 0,
      actionName: 'crop',
      cursorStyle: 'ew-resize',
      actionHandler: makeCropHandler('right'),
      sizeX: 10 * barScale,
      sizeY: 22 * barScale,
      render: (ctx, left, top, style, fo) => renderCropBar(ctx, left, top, style, fo, false),
    }),
    mt: new Control({
      x: 0,
      y: -0.5,
      actionName: 'crop',
      cursorStyle: 'ns-resize',
      actionHandler: makeCropHandler('top'),
      sizeX: 22 * barScale,
      sizeY: 10 * barScale,
      render: (ctx, left, top, style, fo) => renderCropBar(ctx, left, top, style, fo, true),
    }),
    mb: new Control({
      x: 0,
      y: 0.5,
      actionName: 'crop',
      cursorStyle: 'ns-resize',
      actionHandler: makeCropHandler('bottom'),
      sizeX: 22 * barScale,
      sizeY: 10 * barScale,
      render: (ctx, left, top, style, fo) => renderCropBar(ctx, left, top, style, fo, true),
    }),
    mtr: defaults.mtr,
  };

  // Prefer equal corner resize (Canva-like reshape)
  obj.lockUniScaling = false;

  const c = ensureCropState(obj);
  // Re-apply saved crop after load/history
  if (c.left > 0 || c.top > 0 || c.right > 0 || c.bottom > 0) {
    applyCropToObject(obj);
  }
  obj.setCoords();
}

/** Enter dedicated crop mode for the active croppable object. */
export function enterCropMode(obj: FabricObject): boolean {
  if (!isCroppable(obj)) return false;
  if (cropModeTarget && cropModeTarget !== obj) {
    exitCropMode(false);
  }
  cropModeTarget = obj;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (obj as any).baCropMode = true;
  ensureCropState(obj);
  installCropControls(obj);
  // Emphasize crop handles
  obj.set({
    borderColor: '#fbbf24',
    cornerColor: '#fbbf24',
    transparentCorners: false,
  });
  obj.canvas?.setActiveObject(obj);
  obj.canvas?.requestRenderAll();
  return true;
}

/** Leave crop mode (keeps crop result). */
export function exitCropMode(restoreBorder = true): void {
  const obj = cropModeTarget;
  cropModeTarget = null;
  if (!obj) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (obj as any).baCropMode = false;
  if (restoreBorder) {
    obj.set({
      borderColor: '#8ec5ff',
      cornerColor: '#1a1c22',
      cornerStrokeColor: '#8ec5ff',
    });
  }
  installCropControls(obj);
  obj.canvas?.requestRenderAll();
}

export function selectionIsCroppable(getActive: () => FabricObject | null | undefined): boolean {
  const obj = getActive();
  if (!obj) return false;
  const t = (obj.type || '').toLowerCase();
  if (t === 'activeselection') return false;
  return isCroppable(obj);
}

export function objectHasActiveCrop(obj: FabricObject): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (obj as any).baCrop as BaCropInsets | undefined;
  if (!c) return false;
  return c.left > 0.5 || c.top > 0.5 || c.right > 0.5 || c.bottom > 0.5;
}
