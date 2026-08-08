/**
 * Professional export UI (Canva / BioRender-style):
 * formats · PPI · web vs print · quality · transparent PNG.
 */
import {
  FileImage,
  FileText,
  FileType,
  Globe,
  Printer,
  Settings2,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getArtboardSize } from '../../lib/canvasController';
import {
  ALL_PPI_OPTIONS,
  EXPORT_FORMATS,
  artboardInches,
  assessExportRisk,
  defaultPpiForIntent,
  exportFigure,
  outputPixelSize,
  ppiChipTitle,
  ppiOptionsForIntent,
  type ExportFormat,
  type ExportIntent,
} from '../../lib/export';
import { useAppStore } from '../../store/appStore';

const INTENT_OPTIONS: {
  id: ExportIntent;
  label: string;
  hint: string;
  icon: ReactNode;
}[] = [
  {
    id: 'web',
    label: 'Web / online',
    hint: 'Slides, email, social · 72–300 PPI',
    icon: <Globe size={16} />,
  },
  {
    id: 'print',
    label: 'Print / journal',
    hint: 'Manuscripts, posters · default 300 PPI',
    icon: <Printer size={16} />,
  },
  {
    id: 'custom',
    label: 'Custom',
    hint: 'Full PPI list & fine control',
    icon: <Settings2 size={16} />,
  },
];

function formatIcon(id: ExportFormat) {
  if (id === 'pdf') return <FileText size={20} color="#f87171" />;
  if (id === 'svg') return <FileType size={20} color="#34d399" />;
  return <FileImage size={20} color="#8ec5ff" />;
}

export function ExportDialog() {
  const open = useAppStore((s) => s.exportOpen);
  const setExportOpen = useAppStore((s) => s.setExportOpen);
  const projectName = useAppStore((s) => s.projectName);
  const showToast = useAppStore((s) => s.showToast);
  const artboardWidth = useAppStore((s) => s.artboardWidth);
  const artboardHeight = useAppStore((s) => s.artboardHeight);

  const [intent, setIntent] = useState<ExportIntent>('print');
  const [format, setFormat] = useState<ExportFormat>('png');
  /** Print default is always 300 PPI */
  const [ppi, setPpi] = useState(300);
  const [quality, setQuality] = useState(0.92);
  const [transparent, setTransparent] = useState(false);
  const [busy, setBusy] = useState(false);

  const fmtMeta = EXPORT_FORMATS.find((f) => f.id === format)!;
  const ppiChoices = ppiOptionsForIntent(intent);

  useEffect(() => {
    if (!open) return;
    // Reset to intent default when opening or switching Designed-for mode
    setPpi(defaultPpiForIntent(intent));
  }, [intent, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setExportOpen]);

  // Clamp PPI if intent list changed
  useEffect(() => {
    if (!ppiChoices.includes(ppi as (typeof ppiChoices)[number])) {
      setPpi(defaultPpiForIntent(intent));
    }
  }, [ppiChoices, ppi, intent]);

  const preview = useMemo(() => {
    const { width, height } = getArtboardSize();
    const aw = width || artboardWidth;
    const ah = height || artboardHeight;
    const inches = artboardInches(aw, ah);
    const pixels = outputPixelSize(aw, ah, ppi);
    const risk = assessExportRisk(aw, ah, ppi, format);
    return { aw, ah, inches, pixels, risk };
  }, [artboardWidth, artboardHeight, ppi, format, open]);

  if (!open) return null;

  const onDownload = async () => {
    setBusy(true);
    try {
      const result = await exportFigure({
        projectName,
        format,
        ppi,
        quality,
        transparent: transparent && format === 'png',
        intent,
      });
      const detail =
        format === 'svg'
          ? 'SVG vector'
          : `${result.widthPx}×${result.heightPx} px · ${result.ppi} PPI`;
      showToast(`Exported ${result.filename} (${detail})`);
      setExportOpen(false);
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  const node = (
    <div
      className="ba-modal-backdrop ba-export-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setExportOpen(false);
      }}
    >
      <div
        className="ba-modal ba-modal--wide ba-export-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Export figure"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3>Export figure</h3>
        <p>
          Professional download for web or print — same workflow as Canva / BioRender. Canvas is
          authored at 96 DPI design pixels; PPI scales the output.
        </p>

        {/* Intent */}
        <div className="ba-export-section">
          <div className="ba-export-section-label">Designed for</div>
          <div className="ba-export-intent-row">
            {INTENT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`ba-export-intent ${intent === opt.id ? 'active' : ''}`}
                onClick={() => setIntent(opt.id)}
              >
                <span className="ba-export-intent-icon">{opt.icon}</span>
                <span className="ba-export-intent-text">
                  <strong>{opt.label}</strong>
                  <span>{opt.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Format */}
        <div className="ba-export-section">
          <div className="ba-export-section-label">File type</div>
          <div className="ba-export-format-grid">
            {EXPORT_FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`ba-export-format ${format === f.id ? 'active' : ''}`}
                onClick={() => setFormat(f.id)}
              >
                {formatIcon(f.id)}
                <strong>{f.label}</strong>
                <span>{f.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* PPI */}
        {fmtMeta.supportsPpi && (
          <div className="ba-export-section">
            <div className="ba-export-section-label">
              Resolution (PPI)
              <span className="ba-export-section-hint">
                {intent === 'web' && ' · 150 recommended for slides; 72–96 for email'}
                {intent === 'print' && ' · 300 recommended; 600 for small figures only'}
              </span>
            </div>
            <div className="ba-export-ppi-row">
              {(intent === 'custom' ? ALL_PPI_OPTIONS : ppiChoices).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`ba-btn ba-btn-sm ${ppi === v ? 'active' : ''} ${
                    v === 300 && intent === 'print' ? 'ba-export-ppi-default' : ''
                  } ${v > 300 ? 'ba-export-ppi-high' : ''}`}
                  title={ppiChipTitle(v, intent)}
                  onClick={() => setPpi(v)}
                >
                  {v}
                  {v === 300 && intent === 'print' ? ' ★' : ''}
                </button>
              ))}
              {intent === 'custom' && (
                <label className="ba-export-ppi-custom">
                  Custom
                  <input
                    type="number"
                    min={36}
                    max={600}
                    step={1}
                    value={ppi}
                    onChange={(e) => setPpi(Math.max(36, Math.min(600, Number(e.target.value) || 96)))}
                  />
                </label>
              )}
            </div>
            {intent === 'web' && (
              <p className="ba-export-ppi-help">
                For most online use, <strong>96–150 PPI</strong> is enough. Use <strong>200–300</strong> for
                large projectors or retina screens. You rarely need more than 150 for email or web.
              </p>
            )}
            {intent === 'print' && (
              <p className="ba-export-ppi-help">
                Journals and posters almost always use <strong>300 PPI</strong> (selected by default). Use 600
                only for small journal panels — not for large posters.
              </p>
            )}
          </div>
        )}

        {/* JPEG quality */}
        {fmtMeta.supportsQuality && (
          <div className="ba-export-section">
            <div className="ba-export-section-label">
              JPEG quality · {Math.round(quality * 100)}%
            </div>
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.01}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="ba-export-quality"
            />
          </div>
        )}

        {/* Transparent PNG */}
        {fmtMeta.supportsTransparent && (
          <div className="ba-export-section">
            <label className="ba-export-check">
              <input
                type="checkbox"
                checked={transparent}
                onChange={(e) => setTransparent(e.target.checked)}
              />
              Transparent background (PNG)
            </label>
          </div>
        )}

        {/* Memory / large poster warning */}
        {preview.risk && fmtMeta.supportsPpi && (
          <div
            className={`ba-export-warn ba-export-warn-${preview.risk.level}`}
            role="status"
          >
            <strong>{preview.risk.title}</strong>
            <p>{preview.risk.message}</p>
            {ppi > 300 && (
              <button
                type="button"
                className="ba-btn ba-btn-sm"
                onClick={() => setPpi(300)}
              >
                Use recommended 300 PPI
              </button>
            )}
          </div>
        )}

        {/* Preview stats */}
        <div className="ba-export-preview">
          <div>
            <span className="ba-export-preview-k">Artboard</span>
            <span>
              {preview.aw} × {preview.ah} px · {preview.inches.w}″ × {preview.inches.h}″
            </span>
          </div>
          {fmtMeta.supportsPpi ? (
            <div>
              <span className="ba-export-preview-k">Output</span>
              <span>
                {preview.pixels.w.toLocaleString()} × {preview.pixels.h.toLocaleString()} px @ {ppi}{' '}
                PPI
                {preview.risk ? ` · ~${preview.risk.megapixels.toFixed(1)} MP` : ''}
              </span>
            </div>
          ) : (
            <div>
              <span className="ba-export-preview-k">Output</span>
              <span>Vector (scales to any PPI)</span>
            </div>
          )}
          <div>
            <span className="ba-export-preview-k">Format</span>
            <span>
              {fmtMeta.label}
              {transparent && format === 'png' ? ' · transparent' : ''}
            </span>
          </div>
        </div>

        <div className="ba-modal-actions">
          <button type="button" className="ba-btn" onClick={() => setExportOpen(false)} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="ba-btn ba-btn-primary"
            onClick={() => void onDownload()}
            disabled={busy}
            title={
              preview.risk?.level === 'danger'
                ? 'Export may fail on large posters at this PPI'
                : undefined
            }
          >
            {busy ? 'Exporting…' : `Download ${fmtMeta.label}`}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
