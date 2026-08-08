/**
 * Wraps every left-rail content panel with a drag handle on the right edge
 * so users can resize the left column for Library, AI, Chem, Templates, etc.
 * Supports full collapse for canvas-focused work.
 */
import { ChevronLeft, ChevronRight, PanelLeft } from 'lucide-react';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useAppStore } from '../../store/appStore';

const MIN_W = 180;
const MAX_W = 520;

type Props = {
  children: ReactNode;
};

export function LeftPanelShell({ children }: Props) {
  const width = useAppStore((s) => s.leftPanelWidth);
  const setLeftPanelWidth = useAppStore((s) => s.setLeftPanelWidth);
  const open = useAppStore((s) => s.leftPanelOpen);
  const setLeftPanelOpen = useAppStore((s) => s.setLeftPanelOpen);
  const dragging = useRef(false);

  useEffect(() => {
    document.documentElement.style.setProperty('--ba-left-w', open ? `${width}px` : '0px');
  }, [width, open]);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current) return;
      const rail = 52; // matches --ba-rail-w
      const next = Math.round(e.clientX - rail);
      const max = Math.min(MAX_W, Math.floor(window.innerWidth * 0.5));
      setLeftPanelWidth(Math.max(MIN_W, Math.min(max, next)));
    },
    [setLeftPanelWidth],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    document.body.classList.remove('ba-left-resizing');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    document.body.classList.add('ba-left-resizing');
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  if (!open) {
    return (
      <div className="ba-left-shell ba-left-shell-collapsed" aria-hidden>
        <button
          type="button"
          className="ba-panel-expand-tab ba-panel-expand-tab-left"
          title="Show left panel"
          aria-label="Show left panel"
          onClick={() => setLeftPanelOpen(true)}
        >
          <PanelLeft size={16} strokeWidth={1.75} />
          <ChevronRight size={14} strokeWidth={2.25} />
        </button>
      </div>
    );
  }

  return (
    <div className="ba-left-shell" style={{ width }}>
      <button
        type="button"
        className="ba-panel-collapse-btn ba-panel-collapse-left"
        title="Hide left panel"
        aria-label="Hide left panel"
        onClick={() => setLeftPanelOpen(false)}
      >
        <ChevronLeft size={16} strokeWidth={2.25} />
      </button>
      <div className="ba-left-shell-body">{children}</div>
      <div
        className="ba-left-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-label="Resize left panel"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setLeftPanelWidth(Math.max(MIN_W, width - 12));
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            setLeftPanelWidth(Math.min(MAX_W, width + 12));
          }
        }}
        title="Drag to resize panel"
      />
    </div>
  );
}
