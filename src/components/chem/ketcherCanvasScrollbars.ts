/**
 * Always-visible horizontal + vertical scrollbars for the Ketcher canvas.
 * Pans via render.setViewBox. Content bounds are stable (molecule-based) so
 * the thumb actually moves when the view pans — not locked to the viewport.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KetcherLike = any;

type ViewBox = { minX: number; minY: number; width: number; height: number };

type World = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type Metrics = {
  vb: ViewBox;
  world: World;
};

function readViewBox(ketcher: KetcherLike): ViewBox | null {
  try {
    const vb = ketcher?.editor?.render?.viewBox;
    if (
      !vb ||
      !Number.isFinite(vb.minX) ||
      !Number.isFinite(vb.minY) ||
      !Number.isFinite(vb.width) ||
      !Number.isFinite(vb.height) ||
      vb.width <= 0 ||
      vb.height <= 0
    ) {
      return null;
    }
    return {
      minX: vb.minX,
      minY: vb.minY,
      width: vb.width,
      height: vb.height,
    };
  } catch {
    return null;
  }
}

/** Molecule bbox in canvas pixels, or null if empty / unavailable. */
function readMoleculeBox(ketcher: KetcherLike): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} | null {
  try {
    const render = ketcher?.editor?.render;
    const box = render?.ctab?.getVBoxObj?.();
    const scale =
      Number(render?.options?.microModeScale) ||
      Number(render?.options?.scale) ||
      0;
    if (!box?.p0 || !box?.p1 || !(scale > 0)) return null;
    const x0 = box.p0.x * scale;
    const y0 = box.p0.y * scale;
    const x1 = box.p1.x * scale;
    const y1 = box.p1.y * scale;
    if (
      !Number.isFinite(x0) ||
      !Number.isFinite(y0) ||
      !Number.isFinite(x1) ||
      !Number.isFinite(y1)
    ) {
      return null;
    }
    if (x1 - x0 < 0.5 && y1 - y0 < 0.5) return null;
    return { x0, y0, x1, y1 };
  } catch {
    return null;
  }
}

/**
 * Build a scroll world that does NOT follow the current viewBox.
 * Thumb position = where the view sits inside this fixed world.
 */
function buildWorld(
  vb: ViewBox,
  mol: { x0: number; y0: number; x1: number; y1: number } | null,
  prev: World | null,
): World {
  const padX = Math.max(vb.width * 0.5, 80);
  const padY = Math.max(vb.height * 0.5, 80);

  let minX: number;
  let minY: number;
  let maxX: number;
  let maxY: number;

  if (mol) {
    const cx = (mol.x0 + mol.x1) / 2;
    const cy = (mol.y0 + mol.y1) / 2;
    // At least 2× viewport so there is always room to scroll
    const halfW = Math.max((mol.x1 - mol.x0) / 2 + padX, vb.width);
    const halfH = Math.max((mol.y1 - mol.y0) / 2 + padY, vb.height);
    minX = cx - halfW;
    maxX = cx + halfW;
    minY = cy - halfH;
    maxY = cy + halfH;
  } else {
    // Empty canvas: world centered on current view, sized for pan room
    const cx = vb.minX + vb.width / 2;
    const cy = vb.minY + vb.height / 2;
    minX = cx - vb.width;
    maxX = cx + vb.width;
    minY = cy - vb.height;
    maxY = cy + vb.height;
  }

  // Grow world if we already had a larger one (don't shrink while panning)
  if (prev) {
    minX = Math.min(minX, prev.minX);
    minY = Math.min(minY, prev.minY);
    maxX = Math.max(maxX, prev.maxX);
    maxY = Math.max(maxY, prev.maxY);
  }

  // If user pans near an edge, grow world so scrolling can continue
  const edgePadX = vb.width * 0.15;
  const edgePadY = vb.height * 0.15;
  if (vb.minX < minX + edgePadX) minX = vb.minX - padX;
  if (vb.minY < minY + edgePadY) minY = vb.minY - padY;
  if (vb.minX + vb.width > maxX - edgePadX) maxX = vb.minX + vb.width + padX;
  if (vb.minY + vb.height > maxY - edgePadY) maxY = vb.minY + vb.height + padY;

  return { minX, minY, maxX, maxY };
}

function setViewMin(ketcher: KetcherLike, minX: number, minY: number) {
  try {
    const render = ketcher?.editor?.render;
    if (!render || typeof render.setViewBox !== 'function') return;
    const vb = render.viewBox;
    render.setViewBox({
      ...vb,
      minX,
      minY,
      width: vb.width,
      height: vb.height,
    });
    try {
      render.scrollbar?.update?.();
    } catch {
      /* optional */
    }
  } catch {
    /* ignore */
  }
}

function findCanvasEl(host: HTMLElement): HTMLElement | null {
  return (
    (host.querySelector('[class*="StructEditor-module_canvas"]') as HTMLElement) ||
    (host.querySelector('[class*="App-module_canvas"]') as HTMLElement) ||
    null
  );
}

function thumbOffset(
  viewMin: number,
  viewSize: number,
  worldMin: number,
  worldMax: number,
  trackSize: number,
  thumbSize: number,
): number {
  const span = Math.max(worldMax - worldMin, viewSize);
  const scrollable = Math.max(0, span - viewSize);
  const maxOff = Math.max(0, trackSize - thumbSize);
  if (scrollable <= 0 || maxOff <= 0) return 0;
  const t = (viewMin - worldMin) / scrollable;
  return Math.min(maxOff, Math.max(0, t * maxOff));
}

/**
 * Attach always-on H/V scrollbars to the Ketcher canvas inside host.
 * Returns a disposer.
 */
export function attachKetcherCanvasScrollbars(
  host: HTMLElement,
  getKetcher: () => KetcherLike | null,
): () => void {
  const root = document.createElement('div');
  root.className = 'ba-ketcher-scrollbars';
  root.innerHTML = `
    <div class="ba-ketcher-scrollbar ba-ketcher-scrollbar--v" data-axis="v" title="Scroll canvas vertically">
      <div class="ba-ketcher-scrollbar-track" data-track="v">
        <div class="ba-ketcher-scrollbar-thumb" data-thumb="v"></div>
      </div>
    </div>
    <div class="ba-ketcher-scrollbar ba-ketcher-scrollbar--h" data-axis="h" title="Scroll canvas horizontally">
      <div class="ba-ketcher-scrollbar-track" data-track="h">
        <div class="ba-ketcher-scrollbar-thumb" data-thumb="h"></div>
      </div>
    </div>
    <div class="ba-ketcher-scrollbar-corner" aria-hidden="true"></div>
  `;

  const thumbV = root.querySelector('[data-thumb="v"]') as HTMLElement;
  const thumbH = root.querySelector('[data-thumb="h"]') as HTMLElement;
  const trackV = root.querySelector('[data-track="v"]') as HTMLElement;
  const trackH = root.querySelector('[data-track="h"]') as HTMLElement;

  let mountedOn: HTMLElement | null = null;
  let timer = 0;
  let world: World | null = null;
  let drag: null | {
    axis: 'h' | 'v';
    startClient: number;
    startMin: number;
    trackSize: number;
    thumbSize: number;
    worldMin: number;
    worldSpan: number;
    viewSize: number;
  } = null;

  const ensureMounted = () => {
    const canvas = findCanvasEl(host);
    if (!canvas) return null;
    if (mountedOn !== canvas) {
      mountedOn?.querySelector('.ba-ketcher-scrollbars')?.remove();
      const cs = getComputedStyle(canvas);
      if (cs.position === 'static') {
        canvas.style.position = 'relative';
      }
      canvas.appendChild(root);
      mountedOn = canvas;
    }
    return canvas;
  };

  const applyThumbPositions = (m: Metrics) => {
    const spanX = Math.max(m.world.maxX - m.world.minX, m.vb.width);
    const spanY = Math.max(m.world.maxY - m.world.minY, m.vb.height);

    const trackHSize = trackH.clientWidth || 1;
    const trackVSize = trackV.clientHeight || 1;

    const thumbW = Math.max(
      28,
      Math.min(trackHSize - 4, (m.vb.width / spanX) * trackHSize),
    );
    const thumbHgt = Math.max(
      28,
      Math.min(trackVSize - 4, (m.vb.height / spanY) * trackVSize),
    );

    const left = thumbOffset(
      m.vb.minX,
      m.vb.width,
      m.world.minX,
      m.world.maxX,
      trackHSize,
      thumbW,
    );
    const top = thumbOffset(
      m.vb.minY,
      m.vb.height,
      m.world.minY,
      m.world.maxY,
      trackVSize,
      thumbHgt,
    );

    thumbH.style.width = `${thumbW}px`;
    thumbH.style.height = '8px';
    thumbH.style.left = `${2 + left}px`;
    thumbH.style.top = '2px';
    thumbH.style.transform = 'none';

    thumbV.style.height = `${thumbHgt}px`;
    thumbV.style.width = '8px';
    thumbV.style.top = `${2 + top}px`;
    thumbV.style.left = '2px';
    thumbV.style.transform = 'none';
  };

  const readMetrics = (): Metrics | null => {
    const ketcher = getKetcher();
    if (!ketcher) return null;
    const vb = readViewBox(ketcher);
    if (!vb) return null;
    const mol = readMoleculeBox(ketcher);
    world = buildWorld(vb, mol, world);
    return { vb, world };
  };

  const sync = () => {
    ensureMounted();
    // While dragging, pointer handler owns thumb position
    if (drag) return;
    const m = readMetrics();
    if (!m) return;
    applyThumbPositions(m);
    root.dataset.ready = '1';
  };

  const onPointerDownThumb = (axis: 'h' | 'v', e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const m = readMetrics();
    if (!m) return;

    const spanX = Math.max(m.world.maxX - m.world.minX, m.vb.width);
    const spanY = Math.max(m.world.maxY - m.world.minY, m.vb.height);
    const trackSize = axis === 'h' ? trackH.clientWidth : trackV.clientHeight;
    const thumbSize = axis === 'h' ? thumbH.offsetWidth : thumbV.offsetHeight;

    drag = {
      axis,
      startClient: axis === 'h' ? e.clientX : e.clientY,
      startMin: axis === 'h' ? m.vb.minX : m.vb.minY,
      trackSize,
      thumbSize,
      worldMin: axis === 'h' ? m.world.minX : m.world.minY,
      worldSpan: axis === 'h' ? spanX : spanY,
      viewSize: axis === 'h' ? m.vb.width : m.vb.height,
    };

    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    root.classList.add('ba-ketcher-scrollbars--dragging');
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!drag) return;
    const ketcher = getKetcher();
    if (!ketcher) return;
    const vb = readViewBox(ketcher);
    if (!vb) return;

    const delta = (drag.axis === 'h' ? e.clientX : e.clientY) - drag.startClient;
    const maxThumb = Math.max(1, drag.trackSize - drag.thumbSize);
    const scrollable = Math.max(0, drag.worldSpan - drag.viewSize);
    const deltaMin = scrollable <= 0 ? 0 : (delta / maxThumb) * scrollable;

    const nextMin = Math.min(
      Math.max(drag.startMin + deltaMin, drag.worldMin),
      drag.worldMin + scrollable,
    );

    // Move thumb immediately from drag math (do not wait for metrics)
    const thumbPos =
      scrollable <= 0 ? 0 : ((nextMin - drag.worldMin) / scrollable) * maxThumb;
    if (drag.axis === 'h') {
      thumbH.style.left = `${2 + thumbPos}px`;
      setViewMin(ketcher, nextMin, vb.minY);
    } else {
      thumbV.style.top = `${2 + thumbPos}px`;
      setViewMin(ketcher, vb.minX, nextMin);
    }
  };

  const onPointerUp = () => {
    if (!drag) return;
    drag = null;
    root.classList.remove('ba-ketcher-scrollbars--dragging');
    sync();
  };

  const jumpTrack = (axis: 'h' | 'v', e: PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.dataset.thumb || t.closest?.('[data-thumb]')) return;
    e.preventDefault();
    e.stopPropagation();
    const ketcher = getKetcher();
    const m = readMetrics();
    if (!m || !ketcher) return;

    const track = axis === 'h' ? trackH : trackV;
    const thumb = axis === 'h' ? thumbH : thumbV;
    const rect = track.getBoundingClientRect();
    const thumbSize = axis === 'h' ? thumb.offsetWidth : thumb.offsetHeight;
    const trackSize = axis === 'h' ? rect.width : rect.height;
    const click = axis === 'h' ? e.clientX - rect.left : e.clientY - rect.top;
    const maxThumb = Math.max(1, trackSize - thumbSize);
    const ratio = Math.min(1, Math.max(0, (click - thumbSize / 2) / maxThumb));

    const spanX = Math.max(m.world.maxX - m.world.minX, m.vb.width);
    const spanY = Math.max(m.world.maxY - m.world.minY, m.vb.height);

    if (axis === 'h') {
      const scrollable = Math.max(0, spanX - m.vb.width);
      const minX = m.world.minX + ratio * scrollable;
      thumbH.style.left = `${2 + ratio * maxThumb}px`;
      setViewMin(ketcher, minX, m.vb.minY);
    } else {
      const scrollable = Math.max(0, spanY - m.vb.height);
      const minY = m.world.minY + ratio * scrollable;
      thumbV.style.top = `${2 + ratio * maxThumb}px`;
      setViewMin(ketcher, m.vb.minX, minY);
    }
  };

  thumbH.addEventListener('pointerdown', (e) => onPointerDownThumb('h', e));
  thumbV.addEventListener('pointerdown', (e) => onPointerDownThumb('v', e));
  trackH.addEventListener('pointerdown', (e) => jumpTrack('h', e));
  trackV.addEventListener('pointerdown', (e) => jumpTrack('v', e));
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  const onWheel = () => {
    requestAnimationFrame(sync);
  };
  host.addEventListener('wheel', onWheel, { passive: true, capture: true });

  const tick = () => {
    sync();
    timer = window.setTimeout(tick, drag ? 50 : 180) as unknown as number;
  };

  const boot = window.setInterval(() => {
    if (ensureMounted()) {
      window.clearInterval(boot);
      sync();
      tick();
    }
  }, 100);

  const ro = new ResizeObserver(() => sync());
  ro.observe(host);

  return () => {
    window.clearInterval(boot);
    window.clearTimeout(timer);
    ro.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    host.removeEventListener('wheel', onWheel, true);
    root.remove();
    mountedOn = null;
    world = null;
  };
}
