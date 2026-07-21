/**
 * Full-screen Chemistry Studio (separate browser tab / route).
 * Primary editor: Ketcher (Apache-2.0). Styles & export into BioArtist library.
 */
import { ArrowLeft, Download, FlaskConical, Loader2, Save, Send } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  type ChemStyle,
  notifySendToFigure,
  renderChemStyle,
  upsertChemStructure,
} from '../../lib/chemLibrary';
import { applyGlassTheme } from '../../lib/glassTheme';
import { chemSvgToDataUrl, getRDKit, smilesToSvg } from '../../lib/rdkit';
import { loadGlassHue, loadGlassOpacity, loadThemeMode } from '../../lib/storage';

const KetcherEditor = lazy(() =>
  import('./KetcherHost')
    .then((m) => ({ default: m.KetcherHost }))
    .catch((err) => {
      console.error('Ketcher chunk failed', err);
      // Return a stub component so Suspense doesn't blank the whole studio
      return {
        default: function KetcherLoadError({
          onError,
        }: {
          onError?: (e: unknown) => void;
        }) {
          onError?.(err);
          return (
            <div className="ba-chem-studio-fallback">
              <p>Ketcher package failed to load in this browser build.</p>
            </div>
          );
        },
      };
    }),
);

const STYLES: { id: ChemStyle; label: string; hint: string }[] = [
  { id: '2d', label: '2D ACS', hint: 'Publication-style 2D skeleton' },
  { id: 'ballstick', label: 'Ball & stick', hint: 'Emphasized heteroatoms (2D proxy; 3D soon)' },
  { id: 'cpk', label: 'CPK', hint: 'Space-fill colors (2D proxy; 3D soon)' },
  { id: 'wire', label: 'Wire', hint: 'Minimal wireframe 2D' },
];

export function ChemStudio() {
  const [style, setStyle] = useState<ChemStyle>('2d');
  const [name, setName] = useState('Untitled molecule');
  const [smiles, setSmiles] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('smiles') || 'c1ccccc1';
    } catch {
      return 'c1ccccc1';
    }
  });
  const [previewSvg, setPreviewSvg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [ketcherOk, setKetcherOk] = useState(true);
  const ketcherRef = useRef<{
    getSmiles: () => Promise<string>;
    getMolfile: () => Promise<string>;
    setMolecule: (mol: string) => Promise<void>;
  } | null>(null);

  useEffect(() => {
    applyGlassTheme(loadGlassOpacity(), loadGlassHue(), loadThemeMode());
    document.title = 'BioArtist · Chem Studio';
  }, []);

  // Live style preview from SMILES (RDKit)
  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        setBusy(true);
        try {
          await getRDKit();
          const svg = await renderChemStyle(smiles, style);
          if (!cancelled) setPreviewSvg(svg);
        } finally {
          if (!cancelled) setBusy(false);
        }
      })();
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [smiles, style]);

  const syncFromKetcher = useCallback(async () => {
    const k = ketcherRef.current;
    if (!k) return;
    try {
      const s = (await k.getSmiles()).trim();
      if (s) {
        setSmiles(s);
        setStatus('Synced from sketcher');
      }
    } catch (e) {
      console.error(e);
      setStatus('Could not read structure from sketcher');
    }
  }, []);

  const saveToLibrary = useCallback(async () => {
    setBusy(true);
    try {
      let s = smiles.trim();
      let molfile: string | undefined;
      if (ketcherRef.current) {
        try {
          const ks = (await ketcherRef.current.getSmiles()).trim();
          if (ks) s = ks;
          molfile = await ketcherRef.current.getMolfile();
        } catch {
          /* use current smiles */
        }
      }
      if (!s) {
        setStatus('Nothing to save — draw a structure first');
        return;
      }
      setSmiles(s);
      const svg =
        (await renderChemStyle(s, style)) ||
        (await smilesToSvg(s, { width: 280, height: 220, acs: true, transparent: true }));
      if (!svg) {
        setStatus('Invalid structure');
        return;
      }
      const saved = upsertChemStructure({
        name: name.trim() || s.slice(0, 32),
        smiles: s,
        svg,
        source: 'studio',
        style,
        molfile,
      });
      setStatus(`Saved “${saved.name}” to Chem library`);
    } finally {
      setBusy(false);
    }
  }, [name, smiles, style]);

  const sendToFigure = useCallback(async () => {
    setBusy(true);
    try {
      let s = smiles.trim();
      let molfile: string | undefined;
      if (ketcherRef.current) {
        try {
          const ks = (await ketcherRef.current.getSmiles()).trim();
          if (ks) s = ks;
          molfile = await ketcherRef.current.getMolfile();
        } catch {
          /* */
        }
      }
      const svg =
        (await renderChemStyle(s, style)) ||
        (await smilesToSvg(s, { width: 280, height: 220, acs: true, transparent: true }));
      if (!svg || !s) {
        setStatus('Invalid structure');
        return;
      }
      const structure = upsertChemStructure({
        name: name.trim() || s.slice(0, 32),
        smiles: s,
        svg,
        source: 'studio',
        style,
        molfile,
      });
      notifySendToFigure(structure);
      setStatus('Sent to figure editor — switch back to BioArtist to place it');
    } finally {
      setBusy(false);
    }
  }, [name, smiles, style]);

  const downloadSvg = useCallback(() => {
    if (!previewSvg) return;
    const blob = new Blob([previewSvg], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(name || 'molecule').replace(/[^\w\-]+/g, '_')}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [name, previewSvg]);

  const backToFigure = () => {
    // Prefer existing figure tab
    window.location.href = '/';
  };

  return (
    <div className="ba-chem-studio">
      <header className="ba-chem-studio-bar">
        <button type="button" className="ba-btn" onClick={backToFigure} title="Back to figure editor">
          <ArrowLeft size={15} />
          Figure editor
        </button>
        <div className="ba-chem-studio-brand">
          <FlaskConical size={16} />
          <span>Chem Studio</span>
          <span className="ba-chem-studio-tag">Ketcher · Apache-2.0</span>
        </div>
        <input
          className="ba-chem-studio-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          title="Molecule name"
          placeholder="Name"
        />
        <div className="ba-chem-studio-actions">
          <button type="button" className="ba-btn ba-btn-sm" onClick={() => void syncFromKetcher()}>
            Sync SMILES
          </button>
          <button
            type="button"
            className="ba-btn ba-btn-sm"
            disabled={busy}
            onClick={() => void saveToLibrary()}
          >
            <Save size={14} /> Save to library
          </button>
          <button
            type="button"
            className="ba-btn ba-btn-primary ba-btn-sm"
            disabled={busy}
            onClick={() => void sendToFigure()}
          >
            <Send size={14} /> Send to figure
          </button>
          <button type="button" className="ba-btn ba-btn-sm" disabled={!previewSvg} onClick={downloadSvg}>
            <Download size={14} /> SVG
          </button>
        </div>
      </header>

      <div className="ba-chem-studio-body">
        <section className="ba-chem-studio-editor">
          <div className="ba-chem-studio-section-label">2D structure editor</div>
          {ketcherOk ? (
            <Suspense
              fallback={
                <div className="ba-chem-studio-loading">
                  <Loader2 className="ba-spin" size={20} /> Loading Ketcher…
                </div>
              }
            >
              <KetcherEditor
                initialSmiles={smiles}
                onReady={(api) => {
                  ketcherRef.current = api;
                  setStatus('Ketcher ready — draw bonds atom by atom');
                }}
                onError={() => {
                  setKetcherOk(false);
                  setStatus('Ketcher failed to load — SMILES mode still works');
                }}
              />
            </Suspense>
          ) : (
            <div className="ba-chem-studio-fallback">
              <p>Ketcher could not load. You can still edit via SMILES below.</p>
              <textarea
                className="ba-chem-studio-smiles-area"
                value={smiles}
                onChange={(e) => setSmiles(e.target.value)}
                rows={4}
                spellCheck={false}
              />
            </div>
          )}
        </section>

        <aside className="ba-chem-studio-side">
          <div className="ba-chem-studio-section-label">Display style</div>
          <div className="ba-chem-style-grid">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`ba-chem-style-card ${style === s.id ? 'active' : ''}`}
                title={s.hint}
                onClick={() => setStyle(s.id)}
              >
                <strong>{s.label}</strong>
                <span>{s.hint}</span>
              </button>
            ))}
          </div>

          <div className="ba-chem-studio-section-label">SMILES</div>
          <input
            className="ba-chem-smiles-input"
            value={smiles}
            onChange={(e) => setSmiles(e.target.value)}
            spellCheck={false}
            placeholder="SMILES"
          />

          <div className="ba-chem-studio-section-label">Preview (for figure)</div>
          <div className="ba-chem-studio-preview">
            {busy && (
              <span className="ba-chem-preview-busy">
                <Loader2 size={14} className="ba-spin" /> Rendering…
              </span>
            )}
            {!busy && previewSvg && (
              <img src={chemSvgToDataUrl(previewSvg)} alt="Preview" draggable={false} />
            )}
            {!busy && !previewSvg && <span className="ba-text-muted">Invalid SMILES</span>}
          </div>

          <p className="ba-chem-studio-note">
            Draw freely in Ketcher, pick a style, then <strong>Save</strong> or{' '}
            <strong>Send to figure</strong>. The figure Chem panel only lists amino acids, your
            library, imports, and recent favorites — not raw motif dumps.
          </p>
          <p className="ba-chem-studio-status">{status}</p>
        </aside>
      </div>
    </div>
  );
}
