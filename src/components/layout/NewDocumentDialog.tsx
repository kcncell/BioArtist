/**
 * New document dialog — pick a blank canvas size (PowerPoint, posters, publication, custom).
 */
import { FilePlus2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CANVAS_PRESET_GROUPS,
  DESIGN_DPI,
  customSizeToPixels,
  formatPresetSize,
  type CanvasPreset,
  type SizeUnit,
} from '../../lib/canvasPresets';
import { createNewDocument } from '../../lib/documentManager';
import { useAppStore } from '../../store/appStore';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function NewDocumentDialog({ open, onClose }: Props) {
  const showToast = useAppStore((s) => s.showToast);
  const [unit, setUnit] = useState<SizeUnit>('in');
  const [groupId, setGroupId] = useState(CANVAS_PRESET_GROUPS[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(
    CANVAS_PRESET_GROUPS[0].presets[0]?.id ?? null,
  );
  const [customW, setCustomW] = useState('13.333');
  const [customH, setCustomH] = useState('7.5');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const group = useMemo(
    () => CANVAS_PRESET_GROUPS.find((g) => g.id === groupId) || CANVAS_PRESET_GROUPS[0],
    [groupId],
  );

  const selected: CanvasPreset | null = useMemo(() => {
    if (selectedId === 'custom') return null;
    for (const g of CANVAS_PRESET_GROUPS) {
      const p = g.presets.find((x) => x.id === selectedId);
      if (p) return p;
    }
    return group.presets[0] || null;
  }, [selectedId, group]);

  if (!open) return null;

  const create = async () => {
    setBusy(true);
    try {
      let w: number;
      let h: number;
      let label: string;
      if (selectedId === 'custom' || !selected) {
        const cw = Number(customW);
        const ch = Number(customH);
        if (!Number.isFinite(cw) || !Number.isFinite(ch) || cw <= 0 || ch <= 0) {
          showToast('Enter valid custom width and height');
          setBusy(false);
          return;
        }
        const px = customSizeToPixels(cw, ch, unit, DESIGN_DPI);
        w = px.w;
        h = px.h;
        label =
          unit === 'in'
            ? `Custom ${cw}″ × ${ch}″`
            : `Custom ${w} × ${h} px`;
      } else {
        w = selected.w;
        h = selected.h;
        label = selected.label;
      }
      const doc = await createNewDocument({ width: w, height: h });
      showToast(`New canvas · ${label} · ${w}×${h} px`);
      void doc;
      onClose();
    } catch (e) {
      console.error(e);
      showToast('Could not create document');
    } finally {
      setBusy(false);
    }
  };

  const node = (
    <div
      className="ba-newdoc-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="New document"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ba-newdoc-modal">
        <header className="ba-newdoc-header">
          <div className="ba-newdoc-title">
            <FilePlus2 size={18} />
            <div>
              <h2>New canvas</h2>
              <p>Creates a blank figure tab — existing open files stay available.</p>
            </div>
          </div>
          <button type="button" className="ba-btn ba-btn-icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="ba-newdoc-units" role="group" aria-label="Size units">
          <span className="ba-newdoc-units-label">Show sizes in</span>
          <button
            type="button"
            className={`ba-btn ba-btn-sm ${unit === 'in' ? 'active' : ''}`}
            onClick={() => setUnit('in')}
          >
            Inches
          </button>
          <button
            type="button"
            className={`ba-btn ba-btn-sm ${unit === 'px' ? 'active' : ''}`}
            onClick={() => setUnit('px')}
          >
            Pixels
          </button>
          <span className="ba-newdoc-units-hint">
            Canvas uses {DESIGN_DPI} DPI design pixels (inches × {DESIGN_DPI})
          </span>
        </div>

        <div className="ba-newdoc-body">
          <nav className="ba-newdoc-cats" aria-label="Size categories">
            {CANVAS_PRESET_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`ba-newdoc-cat ${groupId === g.id ? 'active' : ''}`}
                onClick={() => {
                  setGroupId(g.id);
                  setSelectedId(g.presets[0]?.id ?? 'custom');
                }}
              >
                {g.label}
              </button>
            ))}
            <button
              type="button"
              className={`ba-newdoc-cat ${selectedId === 'custom' ? 'active' : ''}`}
              onClick={() => setSelectedId('custom')}
            >
              Custom size
            </button>
          </nav>

          <div className="ba-newdoc-presets">
            {selectedId !== 'custom' && (
              <>
                {group.description && (
                  <p className="ba-newdoc-group-desc">{group.description}</p>
                )}
                <div className="ba-newdoc-grid">
                  {group.presets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`ba-newdoc-card ${selectedId === p.id ? 'active' : ''}`}
                      onClick={() => setSelectedId(p.id)}
                    >
                      <span className="ba-newdoc-card-label">{p.label}</span>
                      <span className="ba-newdoc-card-size">{formatPresetSize(p, unit)}</span>
                      {unit === 'in' && (
                        <span className="ba-newdoc-card-px">
                          {p.w} × {p.h} px
                        </span>
                      )}
                      {unit === 'px' && p.inchesW > 0 && (
                        <span className="ba-newdoc-card-px">
                          {p.inchesW.toFixed(p.inchesW >= 10 ? 1 : 2)}″ ×{' '}
                          {p.inchesH.toFixed(p.inchesH >= 10 ? 1 : 2)}″
                        </span>
                      )}
                      {p.note && <span className="ba-newdoc-card-note">{p.note}</span>}
                    </button>
                  ))}
                </div>
              </>
            )}

            {selectedId === 'custom' && (
              <div className="ba-newdoc-custom">
                <p className="ba-newdoc-group-desc">
                  Enter width and height in {unit === 'in' ? 'inches' : 'pixels'}. Max 12,000 px per
                  side.
                </p>
                <div className="ba-newdoc-custom-row">
                  <label>
                    Width ({unit === 'in' ? 'in' : 'px'})
                    <input
                      type="number"
                      min={unit === 'in' ? 0.5 : 100}
                      max={unit === 'in' ? 120 : 12000}
                      step={unit === 'in' ? 0.1 : 1}
                      value={customW}
                      onChange={(e) => setCustomW(e.target.value)}
                    />
                  </label>
                  <span className="ba-newdoc-custom-x">×</span>
                  <label>
                    Height ({unit === 'in' ? 'in' : 'px'})
                    <input
                      type="number"
                      min={unit === 'in' ? 0.5 : 100}
                      max={unit === 'in' ? 120 : 12000}
                      step={unit === 'in' ? 0.1 : 1}
                      value={customH}
                      onChange={(e) => setCustomH(e.target.value)}
                    />
                  </label>
                </div>
                {(() => {
                  const cw = Number(customW);
                  const ch = Number(customH);
                  if (!Number.isFinite(cw) || !Number.isFinite(ch)) return null;
                  const px = customSizeToPixels(cw, ch, unit, DESIGN_DPI);
                  return (
                    <p className="ba-newdoc-custom-preview">
                      Canvas will be <strong>{px.w} × {px.h} px</strong>
                      {unit === 'in' && (
                        <>
                          {' '}
                          ({cw}″ × {ch}″ @ {DESIGN_DPI} DPI)
                        </>
                      )}
                    </p>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        <footer className="ba-newdoc-footer">
          <button type="button" className="ba-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="ba-btn ba-btn-primary"
            onClick={() => void create()}
            disabled={busy}
          >
            <FilePlus2 size={15} />
            {busy ? 'Creating…' : 'Create blank canvas'}
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
