import { ArrowRight, FlaskConical, Square, Type } from 'lucide-react';
import {
  addLine,
  addReactionArrowWithReagents,
  addReagentsToSelectedArrow,
  addShape,
  addTextLabel,
  beginTextBoxDraw,
} from '../../lib/canvasController';
import { LINE_ITEMS, SHAPE_ITEMS } from '../../data/shapesCatalog';
import { useAppStore } from '../../store/appStore';
import type { LineKind, ShapeKind } from '../../types';

export function ShapeLinePanel() {
  const tool = useAppStore((s) => s.tool);
  const showToast = useAppStore((s) => s.showToast);
  const selectionCount = useAppStore((s) => s.selectionCount);

  if (tool === 'text') {
    return (
      <aside className="ba-left-panel">
        <div className="ba-panel-header">Text</div>
        <div className="ba-panel-sub">
          Labels are free text. Text boxes are click-drag rectangles with a border — style border,
          fill, and fonts in Properties.
        </div>
        <div
          style={{
            padding: '0 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'stretch',
          }}
        >
          <button
            type="button"
            className="ba-btn ba-btn-primary ba-text-tool-btn"
            onClick={() => {
              addTextLabel('Label');
              showToast('Text label added — start typing');
            }}
          >
            <Type size={15} aria-hidden />
            <span>Add Text Label</span>
          </button>
          <button
            type="button"
            className="ba-btn ba-btn-primary ba-text-tool-btn"
            onClick={() => {
              beginTextBoxDraw();
              showToast('Click and drag on the canvas to draw a text box · Esc to cancel');
            }}
          >
            <Square size={15} aria-hidden />
            <span>Add Text Box</span>
          </button>
        </div>
        <div className="ba-empty">
          <p style={{ margin: '0 0 8px' }}>
            <strong>Text Label</strong> — plain caption, no border.
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <strong>Text Box</strong> — drag any size; default black outline. Control border
            thickness/color, fill, and Fit to text in Properties. Same font options as labels.
          </p>
          <p style={{ margin: 0 }}>
            Tip: press <strong>T</strong> for a quick label. Double-click text to edit.
          </p>
        </div>
      </aside>
    );
  }

  if (tool === 'shapes') {
    return (
      <aside className="ba-left-panel">
        <div className="ba-panel-header">Shapes</div>
        <div className="ba-panel-sub">Click a shape to place it on the canvas.</div>
        <div className="ba-mini-grid">
          {SHAPE_ITEMS.map((s) => (
            <button
              key={s.id}
              className="ba-mini-card"
              title={s.label}
              onClick={() => {
                addShape(s.id as ShapeKind);
                showToast(`Added ${s.label}`);
              }}
            >
              <div className="ba-mini-thumb">
                <svg viewBox="0 0 80 80" fill="none">
                  <path
                    d={s.preview}
                    stroke="var(--ba-accent)"
                    strokeWidth="3.5"
                    fill="rgba(142,197,255,0.18)"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="ba-mini-label">{s.label}</div>
            </button>
          ))}
        </div>
      </aside>
    );
  }

  if (tool === 'lines') {
    const canAttach = selectionCount === 1;

    return (
      <aside className="ba-left-panel">
        <div className="ba-panel-header">Lines & arrows</div>

        <div className="ba-panel-sub" style={{ paddingTop: 0 }}>
          Reaction scheme — start here
        </div>
        <div className="ba-reaction-tools">
          <button
            type="button"
            className="ba-btn ba-btn-primary ba-reaction-main-btn"
            title="Straight arrow with reagent labels above and below"
            onClick={() => {
              addReactionArrowWithReagents();
              showToast(
                'Reaction arrow added in the center of the canvas — double-click labels to edit',
              );
            }}
          >
            <span className="ba-reaction-main-icon" aria-hidden>
              <FlaskConical size={15} />
              <ArrowRight size={14} />
            </span>
            + Reaction arrow + reagents
          </button>
          <p className="ba-reaction-hint">
            Places a straight arrow with <strong>top</strong> and <strong>bottom</strong> text
            boxes, centered and equidistant. Double-click a box to type reagents / conditions.
            Select a box alone to move or delete it. Paste Chem Studio structures nearby if needed.
          </p>
          <button
            type="button"
            className="ba-btn ba-btn-sm"
            style={{ width: '100%' }}
            disabled={!canAttach}
            title={
              canAttach
                ? 'Add top & bottom reagent boxes to the selected arrow'
                : 'Select one arrow on the canvas first'
            }
            onClick={() => {
              const ok = addReagentsToSelectedArrow();
              showToast(
                ok
                  ? 'Reagent boxes added above and below the selection'
                  : 'Select a single arrow first',
              );
            }}
          >
            Add reagents to selected arrow
          </button>
        </div>

        <div className="ba-panel-sub">Solid, dashed, curves, and arrows</div>
        <div className="ba-mini-grid">
          {LINE_ITEMS.map((s) => (
            <button
              key={s.id}
              className="ba-mini-card"
              title={s.label}
              onClick={() => {
                addLine(s.id as LineKind);
                showToast(`Added ${s.label}`);
              }}
            >
              <div className="ba-mini-thumb">
                <svg viewBox="0 0 80 80" fill="none">
                  <path
                    d={s.preview}
                    stroke="var(--ba-text)"
                    strokeWidth={s.id === 'thick' ? 5 : 3}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={s.dotted ? '2 5' : s.dashed ? '8 5' : undefined}
                  />
                </svg>
              </div>
              <div className="ba-mini-label">{s.label}</div>
            </button>
          ))}
        </div>
      </aside>
    );
  }

  return null;
}
