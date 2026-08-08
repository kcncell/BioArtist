/**
 * Canvas-column toolbar only (between left & right panels).
 * Snap → Copy tools live here and wrap within this column when narrow.
 */
import {
  CircleHelp,
  Grid3x3,
  Group,
  Redo2,
  Undo2,
  Ungroup,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  bringForward,
  duplicateSelection,
  fitToScreen,
  groupSelection,
  redo,
  sendBackward,
  setSnap,
  undo,
  ungroupSelection,
  zoomBy,
} from '../../lib/canvasController';
import { useAppStore } from '../../store/appStore';

export function CanvasToolbar() {
  const canUndo = useAppStore((s) => s.canUndo);
  const canRedo = useAppStore((s) => s.canRedo);
  const zoom = useAppStore((s) => s.zoom);
  const setHelpOpen = useAppStore((s) => s.setHelpOpen);
  const showToast = useAppStore((s) => s.showToast);
  const showGrid = useAppStore((s) => s.showGrid);
  const setShowGrid = useAppStore((s) => s.setShowGrid);
  const snapOn = useAppStore((s) => s.snapOn);
  const setSnapOn = useAppStore((s) => s.setSnapOn);
  const columnGuides = useAppStore((s) => s.columnGuides);
  const setColumnGuides = useAppStore((s) => s.setColumnGuides);
  const rowGuides = useAppStore((s) => s.rowGuides);
  const setRowGuides = useAppStore((s) => s.setRowGuides);

  return (
    <div className="ba-canvas-toolbar" role="toolbar" aria-label="Canvas tools">
      <div className="ba-topbar-group ba-topbar-guides">
        <button
          className={`ba-btn ba-btn-sm ${snapOn ? 'active' : ''}`}
          title="Smart alignment guides"
          onClick={() => {
            const next = !snapOn;
            setSnapOn(next);
            setSnap(next);
            showToast(next ? 'Alignment guides on' : 'Alignment guides off');
          }}
        >
          Snap
        </button>
        <button
          className={`ba-btn ba-btn-icon ${showGrid ? 'active' : ''}`}
          title="Show or hide layout guides (row/column splits) and the fine background grid. Guides are visual only and are never exported."
          onClick={() => {
            setShowGrid(!showGrid);
            showToast(
              showGrid
                ? 'Layout guides & grid hidden'
                : 'Layout guides & grid shown (not exported)',
            );
          }}
        >
          <Grid3x3 size={15} />
        </button>
        <label
          className="ba-guides-num ba-guides-num--tip"
          data-tip={
            'Row splits (layout guides)\n\n' +
            'Splits the canvas into equal horizontal bands for aligning multi-panel figures.\n\n' +
            '• Visual & aligning aid only\n' +
            '• Never exported with your figure\n' +
            '• Use the Grid button to show or hide lines\n' +
            '• 1 = no split · 2+ = equal bands'
          }
        >
          <span className="ba-guides-num-label">Rows</span>
          <input
            type="number"
            className="ba-guides-num-input"
            min={1}
            max={24}
            step={1}
            value={rowGuides}
            aria-label="Number of horizontal layout bands"
            onChange={(e) => {
              const n = Math.max(1, Math.min(24, Math.round(Number(e.target.value) || 1)));
              setRowGuides(n);
            }}
            onBlur={(e) => {
              const n = Math.max(1, Math.min(24, Math.round(Number(e.target.value) || 1)));
              setRowGuides(n);
              showToast(
                n < 2
                  ? 'Rows: 1 (no horizontal split)'
                  : `${n} equal horizontal bands · visual only, not exported`,
              );
            }}
          />
        </label>
        <label
          className="ba-guides-num ba-guides-num--tip"
          data-tip={
            'Column splits (layout guides)\n\n' +
            'Splits the canvas into equal vertical columns for aligning multi-panel figures.\n\n' +
            '• Visual & aligning aid only\n' +
            '• Never exported with your figure\n' +
            '• Use the Grid button to show or hide lines\n' +
            '• 1 = no split · 2+ = equal columns'
          }
        >
          <span className="ba-guides-num-label">Cols</span>
          <input
            type="number"
            className="ba-guides-num-input"
            min={1}
            max={24}
            step={1}
            value={columnGuides}
            aria-label="Number of vertical layout columns"
            onChange={(e) => {
              const n = Math.max(1, Math.min(24, Math.round(Number(e.target.value) || 1)));
              setColumnGuides(n);
            }}
            onBlur={(e) => {
              const n = Math.max(1, Math.min(24, Math.round(Number(e.target.value) || 1)));
              setColumnGuides(n);
              showToast(
                n < 2
                  ? 'Cols: 1 (no vertical split)'
                  : `${n} equal vertical columns · visual only, not exported`,
              );
            }}
          />
        </label>
      </div>

      <div className="ba-topbar-group">
        <button
          className="ba-btn ba-btn-icon"
          title="Undo (⌘Z)"
          disabled={!canUndo}
          onClick={() => undo()}
        >
          <Undo2 size={16} />
        </button>
        <button
          className="ba-btn ba-btn-icon"
          title="Redo (⌘⇧Z)"
          disabled={!canRedo}
          onClick={() => redo()}
        >
          <Redo2 size={16} />
        </button>
      </div>

      <div className="ba-topbar-group">
        <button className="ba-btn ba-btn-icon" title="Zoom out" onClick={() => zoomBy(-0.1)}>
          <ZoomOut size={16} />
        </button>
        <button
          className="ba-btn ba-btn-sm"
          title="Fit artboard to window"
          onClick={() => {
            fitToScreen();
            window.dispatchEvent(new Event('resize'));
            showToast('Fitted to window');
          }}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button className="ba-btn ba-btn-icon" title="Zoom in" onClick={() => zoomBy(0.1)}>
          <ZoomIn size={16} />
        </button>
      </div>

      <div className="ba-topbar-group">
        <button className="ba-btn ba-btn-icon" title="Group (⌘G)" onClick={() => groupSelection()}>
          <Group size={16} />
        </button>
        <button className="ba-btn ba-btn-icon" title="Ungroup" onClick={() => ungroupSelection()}>
          <Ungroup size={16} />
        </button>
        <button className="ba-btn ba-btn-sm" title="Bring forward" onClick={() => bringForward()}>
          Fwd
        </button>
        <button className="ba-btn ba-btn-sm" title="Send backward" onClick={() => sendBackward()}>
          Back
        </button>
        <button
          className="ba-btn ba-btn-sm"
          title="Copy selection (⌘D)"
          onClick={() => duplicateSelection()}
        >
          Copy
        </button>
        <button
          className="ba-btn ba-btn-icon"
          title="Shortcuts (?)"
          onClick={() => setHelpOpen(true)}
        >
          <CircleHelp size={16} />
        </button>
      </div>
    </div>
  );
}
