import { Library, Type } from 'lucide-react';
import { addLine, addShape, addText } from '../../lib/canvasController';
import { LINE_ITEMS, SHAPE_ITEMS } from '../../data/shapesCatalog';
import { useAppStore } from '../../store/appStore';
import type { LineKind, ShapeKind } from '../../types';

function BackToLibraryButton() {
  const setTool = useAppStore((s) => s.setTool);
  const setLibraryTab = useAppStore((s) => s.setLibraryTab);

  return (
    <div style={{ padding: '0 12px 10px' }}>
      <button
        className="ba-btn"
        style={{ width: '100%' }}
        onClick={() => {
          setTool('library');
          setLibraryTab('library');
        }}
      >
        <Library size={14} /> Back to icon library
      </button>
    </div>
  );
}

export function ShapeLinePanel() {
  const tool = useAppStore((s) => s.tool);
  const showToast = useAppStore((s) => s.showToast);

  if (tool === 'text') {
    return (
      <aside className="ba-left-panel">
        <div className="ba-panel-header">Text</div>
        <BackToLibraryButton />
        <div className="ba-panel-sub">
          Add labels and captions. Double-click text on the canvas to edit. Style in Properties.
        </div>
        <div style={{ padding: '0 12px' }}>
          <button
            className="ba-btn ba-btn-primary"
            style={{ width: '100%', height: 36 }}
            onClick={() => {
              addText('Label');
              showToast('Text added — start typing');
            }}
          >
            <Type size={15} /> Add text label
          </button>
        </div>
        <div className="ba-empty">
          Tip: press <strong>T</strong> anytime to add text. Click Text again on the rail to return
          to the icon library.
        </div>
      </aside>
    );
  }

  if (tool === 'shapes') {
    return (
      <aside className="ba-left-panel">
        <div className="ba-panel-header">Shapes</div>
        <BackToLibraryButton />
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
    return (
      <aside className="ba-left-panel">
        <div className="ba-panel-header">Lines & arrows</div>
        <BackToLibraryButton />
        <div className="ba-panel-sub">Solid, dashed, curves, and arrows.</div>
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
