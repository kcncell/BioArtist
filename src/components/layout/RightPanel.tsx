import { useCallback, useEffect, useRef, useState } from 'react';
import { LayersPanel } from '../layers/LayersPanel';
import { PropertiesPanel } from '../properties/PropertiesPanel';

const STORAGE_KEY = 'bioartist-right-split-pct';
/** Default: Properties takes this % of the right column */
const DEFAULT_PROPS_PCT = 48;
/** Collapse thresholds — leave room for section headers */
const MIN_PROPS_PCT = 7;
const MAX_PROPS_PCT = 93;

function loadPct(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROPS_PCT;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_PROPS_PCT;
    return Math.min(MAX_PROPS_PCT, Math.max(MIN_PROPS_PCT, n));
  } catch {
    return DEFAULT_PROPS_PCT;
  }
}

function savePct(pct: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(pct));
  } catch {
    /* ignore */
  }
}

export function RightPanel() {
  const panelRef = useRef<HTMLElement>(null);
  const [propsPct, setPropsPct] = useState(loadPct);
  const [isDragging, setIsDragging] = useState(false);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startPct = useRef(DEFAULT_PROPS_PCT);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      setIsDragging(true);
      startY.current = e.clientY;
      startPct.current = propsPct;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [propsPct],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !panelRef.current) return;
    const h = panelRef.current.getBoundingClientRect().height;
    if (h <= 0) return;
    const deltaPct = ((e.clientY - startY.current) / h) * 100;
    let next = startPct.current + deltaPct;
    next = Math.min(MAX_PROPS_PCT, Math.max(MIN_PROPS_PCT, next));
    setPropsPct(next);
  }, []);

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setPropsPct((p) => {
      savePct(p);
      return p;
    });
  }, []);

  // Double-click divider → restore default split (extra affordance; drag-back still works)
  const onDoubleClick = useCallback(() => {
    setPropsPct(DEFAULT_PROPS_PCT);
    savePct(DEFAULT_PROPS_PCT);
  }, []);

  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  const propsCollapsed = propsPct <= MIN_PROPS_PCT + 0.5;
  const layersCollapsed = propsPct >= MAX_PROPS_PCT - 0.5;

  return (
    <aside className="ba-right-panel" ref={panelRef}>
      <div
        className={`ba-right-pane ba-right-pane-props ${propsCollapsed ? 'collapsed' : ''}`}
        style={{ flex: `0 0 ${propsPct}%` }}
      >
        <PropertiesPanel />
      </div>

      <div
        className={`ba-right-split ${isDragging ? 'active' : ''}`}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize Properties and Layers. Drag to resize; double-click to reset."
        aria-valuenow={Math.round(propsPct)}
        aria-valuemin={MIN_PROPS_PCT}
        aria-valuemax={MAX_PROPS_PCT}
        title="Drag to resize · double-click to reset split"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDoubleClick}
      >
        <span className="ba-right-split-bar" aria-hidden />
      </div>

      <div
        className={`ba-right-pane ba-right-pane-layers ${layersCollapsed ? 'collapsed' : ''}`}
        style={{ flex: '1 1 0' }}
      >
        <LayersPanel />
      </div>
    </aside>
  );
}
