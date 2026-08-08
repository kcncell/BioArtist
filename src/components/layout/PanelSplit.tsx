/**
 * Vertical split: top + bottom panes with a drag handle.
 * Drag fully up/down to collapse a pane; drag the edge strip to restore.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

const COLLAPSE = 0.06;
const MIN_VISIBLE = 0.08;

type Collapsed = 'none' | 'top' | 'bottom';

type Props = {
  top: ReactNode;
  bottom: ReactNode;
  /** localStorage key for ratio + collapse */
  storageKey: string;
  defaultRatio?: number;
  topLabel?: string;
  bottomLabel?: string;
};

function loadState(key: string, fallback: number): { ratio: number; collapsed: Collapsed } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ratio: fallback, collapsed: 'none' };
    const j = JSON.parse(raw) as { ratio?: number; collapsed?: Collapsed };
    const ratio =
      typeof j.ratio === 'number' && j.ratio > 0 && j.ratio < 1 ? j.ratio : fallback;
    const collapsed =
      j.collapsed === 'top' || j.collapsed === 'bottom' || j.collapsed === 'none'
        ? j.collapsed
        : 'none';
    return { ratio, collapsed };
  } catch {
    return { ratio: fallback, collapsed: 'none' };
  }
}

function saveState(key: string, ratio: number, collapsed: Collapsed) {
  try {
    localStorage.setItem(key, JSON.stringify({ ratio, collapsed }));
  } catch {
    /* ignore */
  }
}

export function PanelSplit({
  top,
  bottom,
  storageKey,
  defaultRatio = 0.42,
  topLabel = 'Top',
  bottomLabel = 'Bottom',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startRatio: number } | null>(null);
  const [ratio, setRatio] = useState(() => loadState(storageKey, defaultRatio).ratio);
  const [collapsed, setCollapsed] = useState<Collapsed>(
    () => loadState(storageKey, defaultRatio).collapsed,
  );

  useEffect(() => {
    saveState(storageKey, ratio, collapsed);
  }, [storageKey, ratio, collapsed]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current;
    const root = rootRef.current;
    if (!drag || !root) return;
    const rect = root.getBoundingClientRect();
    if (rect.height < 40) return;
    const y = e.clientY - rect.top;
    let next = y / rect.height;
    next = Math.max(0, Math.min(1, next));

    if (next <= COLLAPSE) {
      setCollapsed('top');
      setRatio(MIN_VISIBLE);
      return;
    }
    if (next >= 1 - COLLAPSE) {
      setCollapsed('bottom');
      setRatio(1 - MIN_VISIBLE);
      return;
    }
    setCollapsed('none');
    setRatio(Math.max(MIN_VISIBLE, Math.min(1 - MIN_VISIBLE, next)));
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    document.body.classList.remove('ba-split-dragging');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove]);

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startY: e.clientY, startRatio: ratio };
    document.body.classList.add('ba-split-dragging');
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const expandFromCollapse = (which: 'top' | 'bottom') => {
    setCollapsed('none');
    setRatio(which === 'top' ? 0.4 : 0.55);
  };

  if (collapsed === 'top') {
    return (
      <div className="ba-panel-split ba-panel-split--collapsed-top" ref={rootRef}>
        <button
          type="button"
          className="ba-panel-split-edge ba-panel-split-edge--top"
          onClick={() => expandFromCollapse('top')}
          onPointerDown={(e) => {
            // Allow drag from the strip to restore
            setCollapsed('none');
            setRatio(MIN_VISIBLE);
            startDrag(e);
          }}
          title={`Show ${topLabel} (drag or click)`}
        >
          <span className="ba-panel-split-edge-label">{topLabel}</span>
        </button>
        <div className="ba-panel-split-pane ba-panel-split-pane--full">{bottom}</div>
      </div>
    );
  }

  if (collapsed === 'bottom') {
    return (
      <div className="ba-panel-split ba-panel-split--collapsed-bottom" ref={rootRef}>
        <div className="ba-panel-split-pane ba-panel-split-pane--full">{top}</div>
        <button
          type="button"
          className="ba-panel-split-edge ba-panel-split-edge--bottom"
          onClick={() => expandFromCollapse('bottom')}
          onPointerDown={(e) => {
            setCollapsed('none');
            setRatio(1 - MIN_VISIBLE);
            startDrag(e);
          }}
          title={`Show ${bottomLabel} (drag or click)`}
        >
          <span className="ba-panel-split-edge-label">{bottomLabel}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="ba-panel-split" ref={rootRef}>
      <div
        className="ba-panel-split-pane"
        style={{ flex: `0 0 ${ratio * 100}%`, minHeight: 0 }}
      >
        {top}
      </div>
      <div
        className="ba-panel-split-handle"
        role="separator"
        aria-orientation="horizontal"
        aria-valuenow={Math.round(ratio * 100)}
        tabIndex={0}
        onPointerDown={startDrag}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setRatio((r) => Math.max(MIN_VISIBLE, r - 0.05));
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setRatio((r) => Math.min(1 - MIN_VISIBLE, r + 0.05));
          }
        }}
        title="Drag to resize · drag fully up/down to hide a section"
      >
        <span className="ba-panel-split-grip" />
      </div>
      <div className="ba-panel-split-pane" style={{ flex: '1 1 0', minHeight: 0 }}>
        {bottom}
      </div>
    </div>
  );
}
