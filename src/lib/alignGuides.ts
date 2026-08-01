/**
 * Smart alignment guides while dragging (Figma / Illustrator style).
 * - Approaching alignment → dotted guide
 * - Within snap distance → snap object + solid guide
 */

import type { Canvas, FabricObject, TMat2D } from 'fabric';

export type AlignGuide = {
  /** Vertical line at x, or horizontal line at y */
  axis: 'x' | 'y';
  pos: number;
  /** Segment extent along the other axis */
  from: number;
  to: number;
  /** True when object is snapped to this guide (solid line) */
  locked: boolean;
};

export type Bounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
};

/** Distance at which we snap and show a solid guide */
export const SNAP_THRESHOLD = 6;
/** Distance at which we show a dotted “near” guide */
export const APPROACH_THRESHOLD = 18;

const GUIDE_COLOR_LOCKED = '#ff2d8a';
const GUIDE_COLOR_NEAR = 'rgba(255, 45, 138, 0.8)';

let activeGuides: AlignGuide[] = [];

export function getActiveGuides(): AlignGuide[] {
  return activeGuides;
}

export function clearAlignGuides(canvas?: Canvas | null) {
  const had = activeGuides.length > 0;
  activeGuides = [];
  if (had) canvas?.requestRenderAll();
}

export function getObjectBounds(obj: FabricObject): Bounds {
  obj.setCoords();
  const r = obj.getBoundingRect();
  const left = r.left;
  const top = r.top;
  const width = r.width;
  const height = r.height;
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    cx: left + width / 2,
    cy: top + height / 2,
    width,
    height,
  };
}

function isActiveSelection(obj: FabricObject): boolean {
  const t = (obj.type || '').toLowerCase();
  return t === 'activeselection' || t === 'activeSelection';
}

function selectionMembers(obj: FabricObject): Set<FabricObject> {
  const set = new Set<FabricObject>([obj]);
  if (isActiveSelection(obj) && 'getObjects' in obj) {
    const group = obj as FabricObject & { getObjects: () => FabricObject[] };
    for (const child of group.getObjects()) set.add(child);
  }
  return set;
}

type EdgeKey = 'left' | 'cx' | 'right' | 'top' | 'cy' | 'bottom';

function edgeValue(b: Bounds, key: EdgeKey): number {
  return b[key];
}

type Cand = {
  delta: number;
  targetPos: number;
  from: number;
  to: number;
  /** Prefer same-edge matches (left-left, cx-cx) over cross matches */
  sameKind: boolean;
  movingKey: EdgeKey;
  targetKey: EdgeKey;
};

function isCenterKey(k: EdgeKey): boolean {
  return k === 'cx' || k === 'cy';
}

/** Center-to-center (cx↔cx or cy↔cy) — primary “structure middle” alignment */
function isCenterToCenter(c: Cand): boolean {
  return isCenterKey(c.movingKey) && isCenterKey(c.targetKey) && c.sameKind;
}

/**
 * Compute snap deltas + guides for a moving object against others and the artboard.
 */
export function computeAlignSnap(
  moving: Bounds,
  targets: Bounds[],
  artboard: { width: number; height: number },
  opts?: {
    snapThreshold?: number;
    approachThreshold?: number;
    /**
     * When true, prefer center–center alignment over edges when both are nearby
     * (Chem Studio multi-structure layout).
     */
    preferCenter?: boolean;
    /** Skip artboard edges/centers (use for free-canvas chem sketcher). */
    skipArtboard?: boolean;
  },
): { dx: number; dy: number; guides: AlignGuide[] } {
  const SNAP = opts?.snapThreshold ?? SNAP_THRESHOLD;
  const APPROACH = opts?.approachThreshold ?? APPROACH_THRESHOLD;
  const preferCenter = !!opts?.preferCenter;

  const artboardTarget: Bounds = {
    left: 0,
    top: 0,
    right: artboard.width,
    bottom: artboard.height,
    cx: artboard.width / 2,
    cy: artboard.height / 2,
    width: artboard.width,
    height: artboard.height,
  };

  const all = opts?.skipArtboard ? [...targets] : [...targets, artboardTarget];
  const xKeys: EdgeKey[] = ['left', 'cx', 'right'];
  const yKeys: EdgeKey[] = ['top', 'cy', 'bottom'];

  const xCands: Cand[] = [];
  const yCands: Cand[] = [];

  for (const t of all) {
    for (const mk of xKeys) {
      for (const tk of xKeys) {
        const m = edgeValue(moving, mk);
        const targetPos = edgeValue(t, tk);
        const delta = targetPos - m;
        // Centers get a slightly larger approach window when preferCenter is on
        const limit =
          preferCenter && mk === 'cx' && tk === 'cx' ? APPROACH * 1.35 : APPROACH;
        if (Math.abs(delta) <= limit) {
          xCands.push({
            delta,
            targetPos,
            from: Math.min(moving.top, t.top),
            to: Math.max(moving.bottom, t.bottom),
            sameKind: mk === tk,
            movingKey: mk,
            targetKey: tk,
          });
        }
      }
    }
    for (const mk of yKeys) {
      for (const tk of yKeys) {
        const m = edgeValue(moving, mk);
        const targetPos = edgeValue(t, tk);
        const delta = targetPos - m;
        const limit =
          preferCenter && mk === 'cy' && tk === 'cy' ? APPROACH * 1.35 : APPROACH;
        if (Math.abs(delta) <= limit) {
          yCands.push({
            delta,
            targetPos,
            from: Math.min(moving.left, t.left),
            to: Math.max(moving.right, t.right),
            sameKind: mk === tk,
            movingKey: mk,
            targetKey: tk,
          });
        }
      }
    }
  }

  function resolveAxis(cands: Cand[], axis: 'x' | 'y') {
    if (!cands.length) return { delta: 0, guides: [] as AlignGuide[] };

    // Score: lower is better. Prefer center–center when enabled so middles snap
    // even if an edge is a hair closer.
    const score = (c: Cand) => {
      let s = Math.abs(c.delta);
      if (preferCenter && isCenterToCenter(c)) {
        // Pull center matches forward so they win over nearby edges
        s -= SNAP * 0.85;
      } else if (c.sameKind) {
        s -= SNAP * 0.05;
      }
      return s;
    };

    const sorted = [...cands].sort((a, b) => {
      const d = score(a) - score(b);
      if (Math.abs(d) > 0.001) return d;
      // Tie-break: center-center, then same-kind, then pure distance
      if (preferCenter) {
        const ac = Number(isCenterToCenter(a));
        const bc = Number(isCenterToCenter(b));
        if (ac !== bc) return bc - ac;
      }
      if (a.sameKind !== b.sameKind) return Number(b.sameKind) - Number(a.sameKind);
      return Math.abs(a.delta) - Math.abs(b.delta);
    });
    const best = sorted[0];
    // Center snaps use a slightly looser lock threshold so middles are easy to hit
    const lockThresh =
      preferCenter && isCenterToCenter(best) ? SNAP * 1.25 : SNAP;
    const locked = Math.abs(best.delta) <= lockThresh;
    const applied = locked ? best.delta : 0;

    const byPos = new Map<string, AlignGuide>();

    for (const c of sorted) {
      const remaining = Math.abs(c.delta - applied);
      const sameAsBest = Math.abs(c.targetPos - best.targetPos) < 0.5;

      // Approaching (not yet snapped): only the single closest guide (dotted)
      if (!locked) {
        if (!sameAsBest) continue;
      } else {
        // Snapped: only edges that are truly aligned after the snap
        if (remaining > 0.75) continue;
      }

      const key = c.targetPos.toFixed(2);
      const existing = byPos.get(key);
      if (existing) {
        existing.from = Math.min(existing.from, c.from - 12);
        existing.to = Math.max(existing.to, c.to + 12);
        existing.locked = existing.locked || locked || remaining <= 0.5;
        continue;
      }

      byPos.set(key, {
        axis,
        pos: c.targetPos,
        from: Math.min(c.from, best.from) - 12,
        to: Math.max(c.to, best.to) + 12,
        locked: locked || remaining <= 0.5,
      });
    }

    const guides = [...byPos.values()].sort((a, b) => Number(b.locked) - Number(a.locked));
    return { delta: applied, guides };
  }

  const xRes = resolveAxis(xCands, 'x');
  const yRes = resolveAxis(yCands, 'y');

  return {
    dx: xRes.delta,
    dy: yRes.delta,
    guides: [...xRes.guides, ...yRes.guides],
  };
}

export function applyMovingAlign(
  canvas: Canvas,
  target: FabricObject,
  artboard: { width: number; height: number },
  enabled: boolean,
): void {
  if (!enabled) {
    activeGuides = [];
    return;
  }

  const members = selectionMembers(target);
  const others = canvas.getObjects().filter((o) => {
    if (members.has(o)) return false;
    if (o.visible === false) return false;
    return true;
  });

  const movingBounds = getObjectBounds(target);
  const targetBounds = others.map(getObjectBounds);

  const { dx, dy, guides } = computeAlignSnap(movingBounds, targetBounds, artboard);

  if (dx !== 0 || dy !== 0) {
    target.set({
      left: (target.left ?? 0) + dx,
      top: (target.top ?? 0) + dy,
    });
    target.setCoords();
    // Recompute guides after snap so solid state is accurate
    const snapped = getObjectBounds(target);
    const again = computeAlignSnap(snapped, targetBounds, artboard);
    activeGuides = again.guides;
  } else {
    activeGuides = guides;
  }
}

export function drawAlignGuides(canvas: Canvas): void {
  if (!activeGuides.length) return;

  // Draw on the main canvas after objects so guides sit above figures.
  // (contextTop is reserved for selection controls — avoid fighting it.)
  const ctx = canvas.contextContainer;
  if (!ctx) return;

  const vpt = (canvas.viewportTransform || [1, 0, 0, 1, 0, 0]) as TMat2D;
  const zoom = canvas.getZoom() || 1;

  ctx.save();
  // after:render usually has identity transform — apply viewport so scene coords map correctly
  ctx.setTransform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);

  for (const g of activeGuides) {
    ctx.beginPath();
    ctx.strokeStyle = g.locked ? GUIDE_COLOR_LOCKED : GUIDE_COLOR_NEAR;
    ctx.lineWidth = (g.locked ? 1.75 : 1.15) / zoom;
    ctx.globalAlpha = g.locked ? 1 : 0.9;
    ctx.setLineDash(g.locked ? [] : [6 / zoom, 5 / zoom]);
    ctx.lineCap = 'round';

    if (g.axis === 'x') {
      ctx.moveTo(g.pos, g.from);
      ctx.lineTo(g.pos, g.to);
    } else {
      ctx.moveTo(g.from, g.pos);
      ctx.lineTo(g.to, g.pos);
    }
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Wire Fabric events once per canvas instance.
 */
export function bindAlignGuideHandlers(
  canvas: Canvas,
  getArtboard: () => { width: number; height: number },
  isSnapEnabled: () => boolean,
): void {
  canvas.on('object:moving', (e) => {
    if (!e.target) return;
    applyMovingAlign(canvas, e.target, getArtboard(), isSnapEnabled());
  });

  const clear = () => {
    if (!activeGuides.length) return;
    clearAlignGuides(canvas);
  };

  canvas.on('object:modified', clear);
  canvas.on('mouse:up', clear);
  canvas.on('selection:cleared', clear);

  canvas.on('after:render', () => {
    if (!activeGuides.length) return;
    drawAlignGuides(canvas);
  });
}

export function resetAlignGuideHandlers() {
  activeGuides = [];
}
