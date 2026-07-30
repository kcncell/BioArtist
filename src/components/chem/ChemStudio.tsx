/**
 * Full-screen Chemistry Studio (separate browser tab / route).
 * Primary editor: Ketcher (Apache-2.0). Right-click → copy for figure canvas.
 */
import {
  ArrowLeft,
  ClipboardCopy,
  Download,
  FlaskConical,
  Loader2,
  Save,
  Send,
  Star,
  Trash2,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  type ChemStructure,
  type ChemStyle,
  loadChemBySource,
  notifySendToFigure,
  removeChemStructure,
  renderChemStyle,
  subscribeChemLibrary,
  upsertChemStructure,
  writeChemClipboard,
} from '../../lib/chemLibrary';
import { applyGlassTheme } from '../../lib/glassTheme';
import { chemSvgToDataUrl, getRDKit, smilesToSvg, stripOpaqueBackgroundRects } from '../../lib/rdkit';
import { loadGlassHue, loadGlassOpacity, loadThemeMode } from '../../lib/storage';
import {
  ChemStudioContextMenu,
  type ChemCtxMenuState,
} from './ChemStudioContextMenu';
import type { KetcherApi } from './KetcherHost';

const KetcherEditor = lazy(() =>
  import('./KetcherHost')
    .then((m) => ({ default: m.KetcherHost }))
    .catch((err) => {
      console.error('Ketcher chunk failed', err);
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

/** Only ACS editor + CPK ball-and-stick for now */
const STYLES: { id: ChemStyle; label: string; hint: string }[] = [
  {
    id: '2d',
    label: '2D ACS',
    hint: 'Edit bonds · monochrome ACS skeleton',
  },
  {
    id: 'ballstick',
    label: 'CPK ball & stick',
    hint: 'CPK-colored atoms + half-colored sticks · click again → ACS',
  },
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
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [ketcherOk, setKetcherOk] = useState(true);
  const [ctxMenu, setCtxMenu] = useState<ChemCtxMenuState | null>(null);
  /** Zoom for ball-and-stick canvas. 1 = fit. */
  const [viewZoom, setViewZoom] = useState(1);
  const [favorites, setFavorites] = useState<ChemStructure[]>([]);
  const ketcherRef = useRef<KetcherApi | null>(null);

  useEffect(() => {
    applyGlassTheme(loadGlassOpacity(), loadGlassHue(), loadThemeMode());
    document.title = 'BioArtist · Chem Studio';
  }, []);

  const refreshFavorites = useCallback(() => {
    setFavorites(loadChemBySource('favorite'));
  }, []);

  useEffect(() => {
    refreshFavorites();
    return subscribeChemLibrary(refreshFavorites);
  }, [refreshFavorites]);

  /** Full-size SVG for the main Chem Studio canvas (not just the side preview). */
  const [canvasSvg, setCanvasSvg] = useState<string | null>(null);

  /** Apply display style: re-read sketcher, re-render main canvas + preview. */
  const applyStyle = useCallback(
    async (next: ChemStyle, opts?: { fromToggle?: boolean }) => {
      setBusy(true);
      try {
        await getRDKit();
        let s = smiles.trim();
        if (ketcherRef.current) {
          try {
            const ks = (await ketcherRef.current.getSmiles()).trim();
            if (ks) s = ks;
          } catch {
            /* keep field */
          }
        }
        if (s) setSmiles(s);
        if (!s) {
          setStyle(next);
          setCanvasSvg(null);
          setStatus(
            next === '2d'
              ? '2D ACS mode — draw in the sketcher; exports use ACS skeleton'
              : 'CPK ball & stick — draw a structure first (switch to 2D ACS to edit)',
          );
          return;
        }
        const large =
          next === '2d'
            ? null
            : await renderChemStyle(s, next, { width: 720, height: 560 });
        setStyle(next);
        setCanvasSvg(large);
        const labels: Record<string, string> = {
          '2d': '2D ACS — sketcher is live for drawing. Exports use ACS bonds.',
          ballstick:
            'CPK ball & stick — gray C, red O, blue N… (click again or 2D ACS to edit)',
        };
        setStatus(
          next === '2d' || large
            ? labels[next] || labels['2d']
            : 'Could not render ball & stick for this structure',
        );
        void opts;
      } finally {
        setBusy(false);
      }
    },
    [smiles],
  );

  // Live re-render ball-and-stick canvas when SMILES / style change
  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        if (!smiles.trim() || style === '2d') {
          if (!cancelled && style === '2d') setCanvasSvg(null);
          if (!cancelled && !smiles.trim()) setCanvasSvg(null);
          return;
        }
        setBusy(true);
        try {
          await getRDKit();
          const large = await renderChemStyle(smiles, 'ballstick', {
            width: 720,
            height: 560,
          });
          if (!cancelled) setCanvasSvg(large);
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

  const onStyleClick = (id: ChemStyle) => {
    // Toggle: active ball & stick → back to ACS
    if (id === 'ballstick' && style === 'ballstick') {
      setViewZoom(1);
      void applyStyle('2d', { fromToggle: true });
      return;
    }
    if (id !== style) setViewZoom(1);
    void applyStyle(id === 'cpk' || id === 'wire' ? 'ballstick' : id);
  };

  /** ⌘/Ctrl + mouse wheel zoom on styled canvas */
  const onStyleCanvasWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setViewZoom((z) => Math.min(4, Math.max(0.35, Number((z + delta).toFixed(3)))));
  };

  /** Read current structure from Ketcher (or SMILES field). */
  const readStructure = useCallback(async () => {
    let s = smiles.trim();
    let molfile: string | undefined;
    if (ketcherRef.current) {
      try {
        const ks = (await ketcherRef.current.getSmiles()).trim();
        if (ks) s = ks;
      } catch {
        /* field smiles */
      }
      try {
        molfile = await ketcherRef.current.getMolfile();
      } catch {
        /* optional */
      }
    }
    return { smiles: s, molfile };
  }, [smiles]);

  /** Build transparent SVG for the figure canvas. */
  const buildSvg = useCallback(
    async (s: string) => {
      const svg =
        (await renderChemStyle(s, style === 'ballstick' ? 'ballstick' : '2d')) ||
        (await smilesToSvg(s, {
          width: 280,
          height: 220,
          style: style === 'ballstick' ? 'ballstick' : '2d',
          acs: true,
          transparent: true,
        }));
      return svg ? stripOpaqueBackgroundRects(svg) : null;
    },
    [style],
  );

  const addCurrentToFavorites = useCallback(async () => {
    setBusy(true);
    try {
      const { smiles: s, molfile } = await readStructure();
      if (!s) {
        setStatus('Nothing to favorite — draw a structure first');
        return;
      }
      const svg =
        (await renderChemStyle(s, style === 'ballstick' ? 'ballstick' : '2d', {
          width: 200,
          height: 160,
        })) || (await buildSvg(s));
      if (!svg) {
        setStatus('Could not save favorite');
        return;
      }
      upsertChemStructure({
        name: name.trim() || s.slice(0, 32),
        smiles: s,
        svg,
        source: 'favorite',
        style: style === 'ballstick' ? 'ballstick' : '2d',
        molfile,
      });
      refreshFavorites();
      setStatus(`Added “${name.trim() || s.slice(0, 24)}” to favorites`);
    } finally {
      setBusy(false);
    }
  }, [buildSvg, name, readStructure, refreshFavorites, style]);

  const loadFavorite = useCallback(
    async (fav: ChemStructure) => {
      setName(fav.name);
      setSmiles(fav.smiles);
      try {
        if (ketcherRef.current && fav.smiles) {
          await ketcherRef.current.setMolecule(fav.smiles);
        }
      } catch {
        /* smiles field still set */
      }
      if (fav.style === 'ballstick') {
        setViewZoom(1);
        void applyStyle('ballstick');
      } else {
        setStyle('2d');
        setCanvasSvg(null);
      }
      setStatus(`Loaded favorite “${fav.name}”`);
    },
    [applyStyle],
  );

  const syncFromKetcher = useCallback(async () => {
    const k = ketcherRef.current;
    if (!k) return;
    try {
      const s = (await k.getSmiles()).trim();
      if (s) {
        setSmiles(s);
        setStatus('Synced from sketcher');
      } else {
        setStatus('Sketcher is empty');
      }
    } catch (e) {
      console.error(e);
      setStatus('Could not read structure from sketcher');
    }
  }, []);

  /** Core: copy structure so figure canvas can paste it. */
  const copyForFigure = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      const { smiles: s, molfile } = await readStructure();
      if (!s && !molfile) {
        setStatus('Nothing to copy — draw a structure first');
        return false;
      }
      // Prefer SMILES for RDKit draw; fall back to molfile as input
      const drawInput = s || molfile || '';
      const svg = await buildSvg(drawInput);
      if (!svg) {
        // molfile path: RDKit get_mol accepts molfile too via drawInput
        setStatus('Could not draw structure for copy');
        return false;
      }
      if (s) setSmiles(s);
      if (style === 'ballstick') setCanvasSvg(svg);
      const { systemOk } = await writeChemClipboard({
        svg,
        smiles: s || '',
        molfile,
        name: name.trim() || s.slice(0, 32) || 'Molecule',
      });
      setStatus(
        systemOk
          ? 'Copied for figure — switch to BioArtist, right-click canvas → Paste (or ⌘V)'
          : 'Copied via Chem bridge — switch to BioArtist and Paste (system clipboard blocked)',
      );
      return true;
    } catch (e) {
      console.error(e);
      setStatus('Copy failed — try Send to figure instead');
      return false;
    } finally {
      setBusy(false);
    }
  }, [buildSvg, name, readStructure, style]);

  const cutForFigure = useCallback(async () => {
    const ok = await copyForFigure();
    if (!ok) return;
    try {
      await ketcherRef.current?.clear();
      setSmiles('');
      setCanvasSvg(null);
      setStatus('Cut for figure — paste on BioArtist canvas (⌘V). Sketcher cleared.');
    } catch {
      setStatus('Copied, but could not clear sketcher');
    }
  }, [copyForFigure]);

  const saveToLibrary = useCallback(async () => {
    setBusy(true);
    try {
      const { smiles: s, molfile } = await readStructure();
      if (!s) {
        setStatus('Nothing to save — draw a structure first');
        return;
      }
      setSmiles(s);
      const svg = await buildSvg(s);
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
  }, [buildSvg, name, readStructure, style]);

  const sendToFigure = useCallback(async () => {
    setBusy(true);
    try {
      const { smiles: s, molfile } = await readStructure();
      const svg = s ? await buildSvg(s) : null;
      if (!svg || !s) {
        setStatus('Invalid structure — draw something first');
        return;
      }
      setSmiles(s);
      // Also park on chem clipboard so Paste works too
      await writeChemClipboard({
        svg,
        smiles: s,
        molfile,
        name: name.trim() || s.slice(0, 32),
      });
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
  }, [buildSvg, name, readStructure, style]);

  const downloadSvg = useCallback(async () => {
    setBusy(true);
    try {
      const { smiles: s } = await readStructure();
      const svg = (s && (await buildSvg(s))) || canvasSvg;
      if (!svg) {
        setStatus('Nothing to download');
        return;
      }
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(name || 'molecule').replace(/[^\w\-]+/g, '_')}.svg`;
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus('SVG downloaded');
    } finally {
      setBusy(false);
    }
  }, [buildSvg, canvasSvg, name, readStructure]);

  const clearSketcher = useCallback(async () => {
    try {
      await ketcherRef.current?.clear();
      setSmiles('');
      setCanvasSvg(null);
      setStatus('Sketcher cleared');
    } catch {
      setStatus('Could not clear sketcher');
    }
  }, []);

  const openCtx = useCallback(
    async (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Probe whether sketcher has content
      let hasStructure = !!(smiles.trim() || canvasSvg);
      if (ketcherRef.current) {
        try {
          const s = (await ketcherRef.current.getSmiles()).trim();
          if (s) {
            hasStructure = true;
            setSmiles(s);
          }
        } catch {
          /* keep previous */
        }
      }
      setCtxMenu({ x: e.clientX, y: e.clientY, hasStructure });
    },
    [canvasSvg, smiles],
  );

  // Keyboard shortcuts while Chem Studio is focused
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField =
        t &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      // ⌘C / ⌘X always capture structure for BioArtist (even over Ketcher)
      if (mod && e.key.toLowerCase() === 'c' && !e.shiftKey) {
        // If user selected text in an input, allow normal text copy
        if (inField) {
          const sel = window.getSelection()?.toString();
          if (sel && sel.length > 0) return;
        }
        e.preventDefault();
        e.stopPropagation();
        void copyForFigure();
        return;
      }
      if (mod && e.key.toLowerCase() === 'x' && !inField) {
        e.preventDefault();
        e.stopPropagation();
        void cutForFigure();
        return;
      }
      if (mod && e.key.toLowerCase() === 's' && !inField) {
        e.preventDefault();
        void downloadSvg();
      }
    };

    // After ANY copy in Chem Studio (including Ketcher’s own), also fill the figure bridge
    const onCopy = () => {
      // Defer so Ketcher finishes its own clipboard write first, then we enrich the bridge
      window.setTimeout(() => {
        void (async () => {
          try {
            if (!ketcherRef.current) return;
            const s = (await ketcherRef.current.getSmiles()).trim();
            if (!s) return;
            // Avoid double-work if we just copied via copyForFigure
            const svg =
              (await renderChemStyle(s, style)) ||
              (await smilesToSvg(s, {
                width: 280,
                height: 220,
                acs: true,
                transparent: true,
              }));
            if (!svg) return;
            let molfile: string | undefined;
            try {
              molfile = await ketcherRef.current.getMolfile();
            } catch {
              /* */
            }
            await writeChemClipboard({
              svg: stripOpaqueBackgroundRects(svg),
              smiles: s,
              molfile,
              name: name.trim() || s.slice(0, 32),
            });
            setSmiles(s);
            if (style === 'ballstick') setCanvasSvg(svg);
            setStatus(
              'Structure ready for BioArtist — switch tabs and Paste (⌘V) on the canvas',
            );
          } catch (err) {
            console.warn('chem copy bridge', err);
          }
        })();
      }, 50);
    };

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('copy', onCopy, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('copy', onCopy, true);
    };
  }, [copyForFigure, cutForFigure, downloadSvg, name, style]);

  const backToFigure = () => {
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
          <button
            type="button"
            className="ba-btn ba-btn-sm"
            disabled={busy}
            title="Copy for BioArtist canvas paste"
            onClick={() => void copyForFigure()}
          >
            <ClipboardCopy size={14} /> Copy for figure
          </button>
          <button
            type="button"
            className="ba-btn ba-btn-sm"
            disabled={busy}
            onClick={() => void downloadSvg()}
          >
            <Download size={14} /> SVG
          </button>
        </div>
      </header>

      <div className="ba-chem-studio-body">
        <section className="ba-chem-studio-editor">
          <div className="ba-chem-studio-section-label">
            {style === '2d'
              ? '2D ACS editor · draw bonds · right-click → Copy for figure'
              : `Viewing ${
                  style === 'ballstick'
                    ? 'ball & stick'
                    : style === 'cpk'
                      ? 'CPK space-fill'
                      : 'CPK wireframe'
                } · switch to 2D ACS to edit bonds`}
          </div>

          {/* Styled main canvas — shown for ballstick / cpk / wire */}
          {style !== '2d' && (
            <div
              className="ba-chem-style-canvas"
              onContextMenu={(e) => {
                e.preventDefault();
                void openCtx(e.nativeEvent);
              }}
              onWheel={onStyleCanvasWheel}
            >
              <div className="ba-chem-style-canvas-toolbar">
                <span className="ba-chem-style-canvas-badge">
                  {style === 'ballstick'
                    ? 'Ball & stick (CPK colors)'
                    : style === 'cpk'
                      ? 'CPK space-fill'
                      : 'CPK wireframe'}
                </span>
                <button
                  type="button"
                  className="ba-btn ba-btn-sm ba-btn-primary"
                  onClick={() => {
                    setViewZoom(1);
                    void applyStyle('2d');
                  }}
                >
                  Edit structure (2D ACS)
                </button>
                <button
                  type="button"
                  className="ba-btn ba-btn-sm"
                  disabled={busy}
                  onClick={() => void copyForFigure()}
                >
                  <ClipboardCopy size={14} /> Copy for figure
                </button>
                <div className="ba-chem-zoom-controls" title="⌘/Ctrl + scroll to zoom">
                  <button
                    type="button"
                    className="ba-btn ba-btn-sm ba-btn-icon"
                    onClick={() => setViewZoom((z) => Math.max(0.35, Number((z - 0.15).toFixed(2))))}
                    aria-label="Zoom out"
                  >
                    −
                  </button>
                  <span className="ba-chem-zoom-label">{Math.round(viewZoom * 100)}%</span>
                  <button
                    type="button"
                    className="ba-btn ba-btn-sm ba-btn-icon"
                    onClick={() => setViewZoom((z) => Math.min(4, Number((z + 0.15).toFixed(2))))}
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="ba-btn ba-btn-sm"
                    onClick={() => setViewZoom(1)}
                    title="Reset zoom"
                  >
                    Fit
                  </button>
                </div>
              </div>
              <div className="ba-chem-style-canvas-stage">
                {busy && (
                  <span className="ba-chem-preview-busy">
                    <Loader2 size={18} className="ba-spin" /> Rendering style…
                  </span>
                )}
                {!busy && canvasSvg && (
                  <img
                    className="ba-chem-style-canvas-img"
                    src={chemSvgToDataUrl(canvasSvg)}
                    alt={`${style} structure`}
                    draggable={false}
                    style={{ transform: `scale(${viewZoom})` }}
                  />
                )}
                {!busy && !canvasSvg && (
                  <div className="ba-chem-studio-fallback">
                    <p>No structure to display. Switch to 2D ACS and draw a molecule.</p>
                    <button
                      type="button"
                      className="ba-btn ba-btn-primary ba-btn-sm"
                      onClick={() => void applyStyle('2d')}
                    >
                      Open 2D ACS editor
                    </button>
                  </div>
                )}
              </div>
              <div className="ba-chem-zoom-hint">⌘/Ctrl + mouse wheel to zoom · − / + / Fit in toolbar</div>
            </div>
          )}

          {/* Ketcher stays mounted so drawings persist; hidden when viewing styled modes */}
          <div
            className="ba-ketcher-slot"
            style={{ display: style === '2d' ? 'flex' : 'none' }}
            aria-hidden={style !== '2d'}
          >
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
                  onContextMenu={(e) => void openCtx(e)}
                  onReady={(api) => {
                    ketcherRef.current = api;
                    setStatus(
                      'Ketcher ready — draw, then pick a display style or Copy for figure (⌘C)',
                    );
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
          </div>
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
                disabled={busy}
                onClick={() => onStyleClick(s.id)}
              >
                <strong>{s.label}</strong>
                <span>{s.hint}</span>
              </button>
            ))}
          </div>
          <p className="ba-chem-studio-style-note">
            <strong>2D ACS</strong> = draw/edit. <strong>CPK ball &amp; stick</strong> = colored
            spheres + sticks on the main canvas (click again to edit).
          </p>

          <div className="ba-chem-studio-section-label">Current SMILES</div>
          <input
            className="ba-chem-smiles-input"
            value={smiles}
            onChange={(e) => setSmiles(e.target.value)}
            spellCheck={false}
            placeholder="SMILES of current structure"
          />

          <div className="ba-chem-studio-section-label">Favorites</div>
          <button
            type="button"
            className="ba-btn ba-btn-sm ba-chem-fav-add"
            disabled={busy}
            onClick={() => void addCurrentToFavorites()}
          >
            <Star size={14} /> Add current to favorites
          </button>
          <div className="ba-chem-fav-list">
            {favorites.length === 0 && (
              <p className="ba-chem-studio-style-note" style={{ margin: '6px 0' }}>
                No favorites yet. Draw a molecule, then star it for one-click access.
              </p>
            )}
            {favorites.map((fav) => (
              <div key={fav.id} className="ba-chem-fav-item">
                <button
                  type="button"
                  className="ba-chem-fav-thumb"
                  title={`${fav.name}\n${fav.smiles}`}
                  onClick={() => void loadFavorite(fav)}
                >
                  {fav.svg ? (
                    <img src={chemSvgToDataUrl(fav.svg)} alt={fav.name} draggable={false} />
                  ) : (
                    <FlaskConical size={18} />
                  )}
                  <span>{fav.name}</span>
                </button>
                <button
                  type="button"
                  className="ba-btn ba-btn-sm ba-btn-icon ba-chem-fav-del"
                  title="Remove favorite"
                  onClick={() => {
                    removeChemStructure(fav.id);
                    refreshFavorites();
                    setStatus(`Removed “${fav.name}”`);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          <p className="ba-chem-studio-note">
            <strong>CPK ball &amp; stick:</strong> atoms = CPK-colored spheres (C gray, O red, N
            blue, S yellow…); bonds = sticks split by atom color. Use a molecule with O/N to see
            colors clearly (e.g. ethanol <code>CCO</code>, caffeine).
          </p>
          <p className="ba-chem-studio-status">{status}</p>
        </aside>
      </div>

      <ChemStudioContextMenu
        menu={ctxMenu}
        onClose={() => setCtxMenu(null)}
        onCopy={() => void copyForFigure()}
        onCut={() => void cutForFigure()}
        onSaveSvg={() => void downloadSvg()}
        onSendToFigure={() => void sendToFigure()}
        onClear={() => void clearSketcher()}
      />
    </div>
  );
}
