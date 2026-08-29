/**
 * Full-screen Chemistry Studio (separate browser tab / route).
 * Primary editor: Ketcher (Apache-2.0). Right-click → copy for figure canvas.
 */
import {
  ArrowLeft,
  ArrowRight,
  ClipboardCopy,
  Download,
  FlaskConical,
  Loader2,
  MoreVertical,
  RotateCcw,
  Save,
  Send,
  Star,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  type ChemStructure,
  type ChemStyle,
  duplicateChemStructure,
  loadChemBySource,
  notifySendToFigure,
  removeChemStructure,
  renameChemStructure,
  renderChemStyle,
  subscribeChemLibrary,
  upsertChemStructure,
  writeChemClipboard,
} from '../../lib/chemLibrary';
import { applyGlassTheme } from '../../lib/glassTheme';
import { chemSvgToDataUrl, getRDKit, smilesToSvg, stripOpaqueBackgroundRects } from '../../lib/rdkit';
import { loadGlassHue, loadGlassOpacity, loadThemeMode } from '../../lib/storage';
import {
  ChemFavoriteContextMenu,
  type ChemFavMenuState,
} from './ChemFavoriteContextMenu';
import {
  ChemStudioContextMenu,
  type ChemCtxMenuState,
} from './ChemStudioContextMenu';
import {
  CHEM_FAV_DRAG_MIME,
  type ChemFavDragPayload,
  type KetcherApi,
} from './KetcherHost';
import { Mol3DViewer, type Mol3DViewerHandle } from './Mol3DViewer';

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
    hint: '3D interactive · CPK colors · rotate & export · click again → ACS',
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
  const [favMenu, setFavMenu] = useState<ChemFavMenuState | null>(null);
  /** Zoom for ball-and-stick canvas. 1 = fit (legacy 2D SVG; 3D uses native zoom). */
  const [, setViewZoom] = useState(1);
  const [favorites, setFavorites] = useState<ChemStructure[]>([]);
  const ketcherRef = useRef<KetcherApi | null>(null);
  const mol3dRef = useRef<Mol3DViewerHandle | null>(null);
  /** Skip the synthetic click that browsers fire after a drag. */
  const favDraggedRef = useRef(false);

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

  /** Optional 2D SVG fallback / ACS export asset while 3D is primary for ballstick. */
  const [canvasSvg, setCanvasSvg] = useState<string | null>(null);
  /** Structure string fed to 3D viewer (SMILES preferred). */
  const [mol3dInput, setMol3dInput] = useState('');

  /** Apply display style: re-read sketcher; 3D ballstick vs 2D ACS editor. */
  const applyStyle = useCallback(
    async (next: ChemStyle, opts?: { fromToggle?: boolean }) => {
      setBusy(true);
      try {
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
          setMol3dInput('');
          setStatus(
            next === '2d'
              ? '2D ACS mode — draw in the sketcher; exports use ACS skeleton'
              : 'CPK ball & stick (3D) — draw a structure first (switch to 2D ACS to edit)',
          );
          return;
        }
        setStyle(next);
        if (next === '2d') {
          setCanvasSvg(null);
          setMol3dInput('');
          ketcherRef.current?.setSelectStructure();
          setStatus(
            '2D ACS — empty-canvas drag selects · drag a selected molecule/arrow/plus to move · eraser/bond keep native drag'
          );
        } else {
          setMol3dInput(s);
          // Keep a 2D ACS SVG as non-3D fallback for thumbs / ACS export if needed
          try {
            await getRDKit();
            const acs = await renderChemStyle(s, '2d', { width: 280, height: 220 });
            setCanvasSvg(acs);
          } catch {
            setCanvasSvg(null);
          }
          setStatus(
            '3D CPK ball & stick — drag to rotate · scroll to zoom · Copy for figure exports transparent PNG',
          );
        }
        void opts;
      } finally {
        setBusy(false);
      }
    },
    [smiles],
  );

  // When SMILES changes while in ballstick mode, refresh 3D input
  useEffect(() => {
    if (style !== '2d' && smiles.trim()) {
      setMol3dInput(smiles.trim());
    }
    if (style === '2d' || !smiles.trim()) {
      if (style === '2d') setMol3dInput('');
    }
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
      // Prefer the *selection* when present so multi-structure canvases
      // only favorite the molecule that was right-clicked / selected.
      let s = '';
      let molfile: string | undefined;
      let selectedOnly = false;

      if (ketcherRef.current?.getSelectedOrFullStructure) {
        try {
          const exp = await ketcherRef.current.getSelectedOrFullStructure();
          s = (exp.smiles || '').trim();
          molfile = exp.molfile;
          selectedOnly = exp.selectedOnly;
        } catch {
          /* fall through */
        }
      }
      if (!s) {
        const full = await readStructure();
        s = full.smiles;
        molfile = full.molfile;
        selectedOnly = false;
      }

      if (!s) {
        setStatus('Nothing to favorite — select a structure (or draw one first)');
        return;
      }

      // Thumbnails always use ACS 2D for clarity
      const svg =
        (await renderChemStyle(s, '2d', { width: 200, height: 160 })) ||
        (await buildSvg(s));
      if (!svg) {
        // Try molfile path
        const fromMol =
          molfile &&
          ((await renderChemStyle(molfile, '2d', { width: 200, height: 160 })) ||
            (await smilesToSvg(molfile, { width: 200, height: 160, acs: true, transparent: true })));
        if (!fromMol) {
          setStatus('Could not save favorite');
          return;
        }
        const label = name.trim() || s.slice(0, 32);
        upsertChemStructure({
          name: label,
          smiles: s,
          svg: fromMol,
          source: 'favorite',
          style: '2d',
          molfile,
        });
        refreshFavorites();
        setStatus(
          selectedOnly
            ? `Added selected structure “${label.slice(0, 24)}” to favorites`
            : `Added “${label.slice(0, 24)}” to favorites`,
        );
        return;
      }

      const label = name.trim() || s.slice(0, 32);
      upsertChemStructure({
        name: label,
        smiles: s,
        svg,
        source: 'favorite',
        style: '2d',
        molfile,
      });
      refreshFavorites();
      setStatus(
        selectedOnly
          ? `Added selected structure “${label.slice(0, 24)}” to favorites`
          : `Added “${label.slice(0, 24)}” to favorites (entire canvas — select one molecule to favorite only that)`,
      );
    } finally {
      setBusy(false);
    }
  }, [buildSvg, name, readStructure, refreshFavorites]);

  /**
   * Add a favorite onto the sketcher without clearing existing drawing.
   * Optional drop position (model coords) from drag-and-drop.
   * Prefer SMILES (molfile failures are often silent in Ketcher).
   */
  const addFavoriteToCanvas = useCallback(
    async (fav: ChemStructure, position?: { x: number; y: number }) => {
      if (!(fav.smiles || fav.molfile)?.trim()) {
        setStatus('Favorite has no structure to add');
        return;
      }
      // Ensure we're in edit mode so the user sees the addition
      if (style !== '2d') {
        setViewZoom(1);
        setStyle('2d');
        setCanvasSvg(null);
      }
      const api = ketcherRef.current;
      if (!api) {
        setSmiles((prev) => (prev.trim() ? prev : fav.smiles));
        setName(fav.name);
        setStatus(`Set SMILES to “${fav.name}” (sketcher not ready — try again in a moment)`);
        return;
      }
      setBusy(true);
      try {
        const result = await api.addFragment({
          smiles: fav.smiles,
          molfile: fav.molfile,
          position,
        });
        if (result.ok) {
          if (result.smiles) setSmiles(result.smiles);
          setStatus(
            position
              ? `Dropped “${fav.name}” on canvas`
              : `Added “${fav.name}” to canvas (existing drawing kept)`,
          );
        } else {
          setStatus(
            `Could not add “${fav.name}” — ${result.error || 'try re-saving the favorite'}`,
          );
        }
      } catch (err) {
        console.error(err);
        setStatus(`Could not add “${fav.name}” to canvas`);
      } finally {
        setBusy(false);
      }
    },
    [style],
  );

  /** Context menu alias — same as click-to-add */
  const loadFavorite = addFavoriteToCanvas;

  const onFavoriteDragStart = useCallback(
    (e: React.DragEvent, fav: ChemStructure) => {
      favDraggedRef.current = true;
      const payload: ChemFavDragPayload = {
        smiles: fav.smiles,
        molfile: fav.molfile,
        name: fav.name,
      };
      e.dataTransfer.setData(CHEM_FAV_DRAG_MIME, JSON.stringify(payload));
      e.dataTransfer.setData('text/plain', fav.smiles || fav.name);
      e.dataTransfer.effectAllowed = 'copy';
      // Prefer thumbnail as drag image when available
      const img = (e.currentTarget as HTMLElement).querySelector('img');
      if (img) {
        try {
          e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
        } catch {
          /* ignore */
        }
      }
      setStatus(`Drag “${fav.name}” onto the canvas to place it`);
    },
    [],
  );

  const onFavoriteClick = useCallback(
    (fav: ChemStructure) => {
      // Ignore the click that browsers fire after a completed drag
      if (favDraggedRef.current) {
        favDraggedRef.current = false;
        return;
      }
      void addFavoriteToCanvas(fav);
    },
    [addFavoriteToCanvas],
  );

  const openFavMenuAt = useCallback((x: number, y: number, fav: ChemStructure) => {
    setCtxMenu(null);
    setFavMenu({ x, y, fav });
  }, []);

  const copyFavoriteForFigure = useCallback(async (fav: ChemStructure) => {
    setBusy(true);
    try {
      const svg =
        fav.svg ||
        (await renderChemStyle(fav.smiles, fav.style === 'ballstick' ? 'ballstick' : '2d')) ||
        (await smilesToSvg(fav.smiles, {
          width: 280,
          height: 220,
          acs: true,
          transparent: true,
        }));
      if (!svg) {
        setStatus('Could not copy favorite for figure');
        return;
      }
      const { systemOk } = await writeChemClipboard({
        svg: stripOpaqueBackgroundRects(svg),
        smiles: fav.smiles,
        molfile: fav.molfile,
        name: fav.name,
      });
      setStatus(
        systemOk
          ? `Copied “${fav.name}” — switch to BioArtist and Paste (⌘V)`
          : `Copied “${fav.name}” via Chem bridge — Paste on BioArtist canvas`,
      );
    } catch (err) {
      console.error(err);
      setStatus('Copy favorite failed');
    } finally {
      setBusy(false);
    }
  }, []);

  const sendFavoriteToBioArtist = useCallback(async (fav: ChemStructure) => {
    setBusy(true);
    try {
      let svg =
        fav.svg ||
        (await renderChemStyle(fav.smiles, fav.style === 'ballstick' ? 'ballstick' : '2d')) ||
        null;
      if (!svg && fav.smiles) {
        svg = await smilesToSvg(fav.smiles, {
          width: 280,
          height: 220,
          acs: true,
          transparent: true,
        });
      }
      if (!svg) {
        setStatus('Favorite has no drawable structure — re-save it from the sketcher');
        return;
      }
      const clean = stripOpaqueBackgroundRects(svg);
      await writeChemClipboard({
        svg: clean,
        smiles: fav.smiles,
        molfile: fav.molfile,
        name: fav.name,
      });
      const structure: ChemStructure = { ...fav, svg: clean };
      notifySendToFigure(structure);
      setStatus(
        `Sent “${fav.name}” to BioArtist — open the figure tab (any tool) to place it, or Paste (⌘V)`,
      );
    } catch (err) {
      console.error(err);
      setStatus('Could not send favorite to BioArtist');
    } finally {
      setBusy(false);
    }
  }, []);

  const renameFavorite = useCallback(
    (fav: ChemStructure) => {
      const next = window.prompt('Rename favorite', fav.name);
      if (next == null) return;
      const trimmed = next.trim();
      if (!trimmed || trimmed === fav.name) return;
      const updated = renameChemStructure(fav.id, trimmed);
      if (updated) {
        refreshFavorites();
        if (name === fav.name) setName(updated.name);
        setStatus(`Renamed to “${updated.name}”`);
      } else {
        setStatus('Could not rename favorite');
      }
    },
    [name, refreshFavorites],
  );

  const downloadFavoriteSvg = useCallback((fav: ChemStructure) => {
    const svg = fav.svg;
    if (!svg) {
      setStatus('No SVG stored for this favorite');
      return;
    }
    const blob = new Blob([stripOpaqueBackgroundRects(svg)], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(fav.name || 'molecule').replace(/[^\w\-]+/g, '_')}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus(`Downloaded “${fav.name}.svg”`);
  }, []);

  const copyFavoriteSmiles = useCallback(async (fav: ChemStructure) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fav.smiles);
        setStatus(`Copied SMILES for “${fav.name}”`);
      } else {
        setStatus(fav.smiles);
      }
    } catch {
      setStatus(fav.smiles || 'No SMILES');
    }
  }, []);

  const duplicateFavorite = useCallback(
    (fav: ChemStructure) => {
      const copy = duplicateChemStructure(fav.id);
      if (copy) {
        refreshFavorites();
        setStatus(`Duplicated as “${copy.name}”`);
      } else {
        setStatus('Could not duplicate favorite');
      }
    },
    [refreshFavorites],
  );

  const deleteFavorite = useCallback(
    (fav: ChemStructure) => {
      const ok = window.confirm(`Delete favorite “${fav.name}”?`);
      if (!ok) return;
      removeChemStructure(fav.id);
      refreshFavorites();
      setStatus(`Removed “${fav.name}”`);
    },
    [refreshFavorites],
  );

  /**
   * SMILES field → canvas: place structure using the active display style.
   * Enter in the SMILES input also runs this.
   */
  const convertSmilesToStructure = useCallback(async () => {
    const raw = smiles.trim();
    if (!raw) {
      setStatus('Enter a SMILES string first');
      return;
    }
    setBusy(true);
    try {
      const RDKit = await getRDKit();
      const mol = RDKit.get_mol(raw);
      if (!mol) {
        setStatus('Invalid SMILES — check the string and try again');
        return;
      }
      let canon = raw;
      try {
        if (typeof mol.is_valid === 'function' && !mol.is_valid()) {
          setStatus('Invalid SMILES — check the string and try again');
          return;
        }
        canon = (mol.get_smiles() || raw).trim() || raw;
      } finally {
        mol.delete();
      }

      if (style === '2d') {
        const api = ketcherRef.current;
        if (!api) {
          setStatus('Sketcher not ready — wait a moment and try again');
          return;
        }
        const result = await api.addFragment({ smiles: canon });
        if (!result.ok) {
          setStatus(result.error || 'Could not place structure on canvas');
          return;
        }
        if (result.smiles) setSmiles(result.smiles);
        else setSmiles(canon);
        setStatus('Placed structure on canvas from SMILES (2D ACS)');
        return;
      }

      // CPK ball & stick (and other styled views): show in 3D viewer
      setSmiles(canon);
      setMol3dInput(canon);
      try {
        const acs = await renderChemStyle(canon, '2d', { width: 280, height: 220 });
        setCanvasSvg(acs);
      } catch {
        setCanvasSvg(null);
      }
      try {
        if (ketcherRef.current) {
          const result = await ketcherRef.current.addFragment({ smiles: canon });
          if (!result.ok) {
            await ketcherRef.current.setMolecule(canon);
          }
        }
      } catch {
        try {
          await ketcherRef.current?.setMolecule(canon);
        } catch {
          /* sketcher sync optional in 3D mode */
        }
      }
      setStatus('Showing structure in CPK ball & stick from SMILES');
    } catch (e) {
      console.error(e);
      setStatus('Could not convert SMILES to structure');
    } finally {
      setBusy(false);
    }
  }, [smiles, style]);

  /**
   * Canvas (selection preferred) → SMILES field.
   */
  const convertStructureToSmiles = useCallback(async () => {
    setBusy(true);
    try {
      if (ketcherRef.current?.getSelectedOrFullStructure) {
        try {
          const exp = await ketcherRef.current.getSelectedOrFullStructure();
          const s = (exp.smiles || '').trim();
          if (s) {
            setSmiles(s);
            if (style !== '2d') setMol3dInput(s);
            setStatus(
              exp.selectedOnly
                ? 'Converted selected structure to SMILES'
                : 'Converted canvas structure to SMILES',
            );
            return;
          }
        } catch {
          /* fall through */
        }
      }

      const k = ketcherRef.current;
      if (k) {
        try {
          const s = (await k.getSmiles()).trim();
          if (s) {
            setSmiles(s);
            if (style !== '2d') setMol3dInput(s);
            setStatus('Converted canvas structure to SMILES');
            return;
          }
        } catch {
          /* fall through */
        }
      }

      const fallback = (mol3dInput || smiles).trim();
      if (style !== '2d' && fallback) {
        setSmiles(fallback);
        setStatus('Filled SMILES from the current 3D structure');
        return;
      }

      setStatus('No structure on canvas — draw or select one first');
    } catch (e) {
      console.error(e);
      setStatus('Could not convert structure to SMILES');
    } finally {
      setBusy(false);
    }
  }, [mol3dInput, smiles, style]);

  /**
   * Capture the *current* 3D camera as transparent PNG for BioArtist.
   * Must run before any setState that re-renders the page (which used to remount the viewer).
   */
  const captureCurrent3dView = useCallback((): string | null => {
    if (style !== 'ballstick') return null;
    const v = mol3dRef.current;
    if (!v?.isReady?.()) return null;
    return v.capturePng();
  }, [style]);

  /** Stable callbacks so Mol3DViewer does not rebuild the model on every parent render. */
  const onMol3dReady = useCallback(
    ({ is3d, source }: { is3d: boolean; source: string }) => {
      setStatus(
        is3d
          ? `3D CPK ball & stick ready (${source}) — drag to rotate · “Copy this 3D view” exports the exact camera`
          : `Showing structure without full 3D embed (${source}) — try a common molecule for PubChem 3D`,
      );
    },
    [],
  );
  const onMol3dError = useCallback((msg: string) => {
    setStatus(msg);
  }, []);

  /** Core: copy structure so figure canvas can paste it. */
  const copyForFigure = useCallback(async (): Promise<boolean> => {
    // 3D: snapshot the camera FIRST, before any React state update remounts the viewer
    let png3d: string | null = null;
    if (style === 'ballstick') {
      await new Promise<void>((r) => {
        requestAnimationFrame(() => requestAnimationFrame(() => r()));
      });
      png3d = captureCurrent3dView();
    }

    setBusy(true);
    try {
      const { smiles: s, molfile } = await readStructure();
      if (!s && !molfile && !png3d) {
        setStatus('Nothing to copy — draw a structure first');
        return false;
      }
      // Only update SMILES field if it changed — avoids useless re-renders
      if (s && s !== smiles) setSmiles(s);

      if (style === 'ballstick') {
        if (png3d) {
          const { systemOk } = await writeChemClipboard({
            pngDataUrl: png3d,
            smiles: s || '',
            molfile,
            name: name.trim() || s.slice(0, 32) || 'Molecule',
          });
          setStatus(
            systemOk
              ? 'Copied this 3D view (transparent) — switch to BioArtist and Paste (⌘V)'
              : 'Copied this 3D view via Chem bridge — Paste on BioArtist canvas',
          );
          return true;
        }
        setStatus(
          'Could not capture 3D view — wait until the model finishes loading, then try again',
        );
        return false;
      }

      // 2D ACS path
      const drawInput = s || molfile || '';
      const svg = await buildSvg(drawInput);
      if (!svg) {
        setStatus('Could not draw structure for copy');
        return false;
      }
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
  }, [buildSvg, captureCurrent3dView, name, readStructure, smiles, style]);

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
      setFavMenu(null);
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        hasStructure,
        is3dView: style === 'ballstick',
      });
    },
    [canvasSvg, smiles, style],
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

    // After system copy (incl. right-click / ⌘C), keep the Chem bridge filled.
    // In ball-and-stick mode always capture the *current* 3D view — never overwrite
    // with a default ACS 2D redraw.
    const onCopy = () => {
      window.setTimeout(() => {
        void (async () => {
          try {
            if (style === 'ballstick') {
              // Capture immediately — do not await network/smiles first (avoids remount race)
              await new Promise<void>((r) => {
                requestAnimationFrame(() => requestAnimationFrame(() => r()));
              });
              const png = captureCurrent3dView();
              if (png) {
                let s = smiles.trim();
                let molfile: string | undefined;
                try {
                  if (ketcherRef.current) {
                    s = (await ketcherRef.current.getSmiles()).trim() || s;
                    molfile = await ketcherRef.current.getMolfile();
                  }
                } catch {
                  /* optional */
                }
                await writeChemClipboard({
                  pngDataUrl: png,
                  smiles: s,
                  molfile,
                  name: name.trim() || s.slice(0, 32) || 'Molecule',
                });
                setStatus(
                  'Copied this 3D view (transparent) — switch to BioArtist and Paste (⌘V)',
                );
              }
              return;
            }

            if (!ketcherRef.current) return;
            const s = (await ketcherRef.current.getSmiles()).trim();
            if (!s) return;
            const svg =
              (await renderChemStyle(s, '2d')) ||
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
  }, [captureCurrent3dView, copyForFigure, cutForFigure, downloadSvg, name, smiles, style]);

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
              ? '2D ACS · drag to marquee-select · click structure to select · eraser/bond keep native drag · right-click → Copy'
              : `Viewing ${
                  style === 'ballstick'
                    ? 'ball & stick'
                    : style === 'cpk'
                      ? 'CPK space-fill'
                      : 'CPK wireframe'
                } · switch to 2D ACS to edit bonds`}
          </div>

          {/* 3D CPK ball-and-stick (MolView-style) — shown when not in 2D ACS */}
          {style !== '2d' && (
            <div
              className="ba-chem-style-canvas"
              onContextMenu={(e) => {
                e.preventDefault();
                void openCtx(e.nativeEvent);
              }}
            >
              <div className="ba-chem-style-canvas-toolbar">
                <span className="ba-chem-style-canvas-badge">
                  3D ball &amp; stick · CPK (Jmol) colors
                </span>
                <button
                  type="button"
                  className="ba-btn ba-btn-sm ba-btn-primary"
                  onClick={() => {
                    setViewZoom(1);
                    void applyStyle('2d');
                    queueMicrotask(() => ketcherRef.current?.setSelectStructure());
                  }}
                >
                  Edit structure (2D ACS)
                </button>
                <button
                  type="button"
                  className="ba-btn ba-btn-sm"
                  title="Copy the current rotated 3D view as a transparent PNG for BioArtist"
                  onClick={() => {
                    void copyForFigure();
                  }}
                >
                  <ClipboardCopy size={14} /> Copy this 3D view for figure
                </button>
                <button
                  type="button"
                  className="ba-btn ba-btn-sm"
                  title="Reset camera to the initial fit after the model loaded"
                  onClick={() => {
                    mol3dRef.current?.resetView();
                    setStatus('3D view reset to initial orientation');
                  }}
                >
                  <RotateCcw size={14} /> Reset view
                </button>
              </div>
              <div className="ba-chem-style-canvas-stage ba-chem-style-canvas-stage--3d">
                {mol3dInput ? (
                  <Mol3DViewer
                    ref={mol3dRef}
                    structure={mol3dInput}
                    onReady={onMol3dReady}
                    onError={onMol3dError}
                  />
                ) : (
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
              <div className="ba-chem-zoom-hint">
                Drag to rotate · scroll to zoom · right-drag to pan · transparent PNG export for
                BioArtist
              </div>
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
                  onFragmentAdded={({ name }) => {
                    setStatus(
                      name
                        ? `Dropped “${name}” onto canvas`
                        : 'Dropped structure onto canvas',
                    );
                    void (async () => {
                      try {
                        const s = (await ketcherRef.current?.getSmiles())?.trim();
                        if (s) setSmiles(s);
                      } catch {
                        /* ignore */
                      }
                    })();
                  }}
                  onReady={(api) => {
                    ketcherRef.current = api;
                    // Default: structure select + hover; plain drag marquees unless eraser/bond
                    api.setSelectStructure();
                    setStatus(
                      'Ketcher ready — click to select · empty-canvas drag to marquee · drag selection (molecule/arrow/plus) to move',
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
          <div className="ba-chem-studio-section-label">Reaction scheme</div>
          <div className="ba-chem-reaction-tools">
            <button
              type="button"
              className="ba-btn ba-btn-primary ba-btn-sm"
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={busy || !ketcherOk || style !== '2d'}
              title="Insert a straight reaction arrow with top & bottom reagent labels"
              onClick={() => {
                const api = ketcherRef.current;
                if (!api) {
                  setStatus('Sketcher not ready yet');
                  return;
                }
                if (style !== '2d') {
                  setStatus('Switch to 2D ACS to edit reaction schemes');
                  return;
                }
                const r = api.addReactionArrowWithReagents();
                setStatus(
                  r.ok
                    ? 'Reaction arrow + labels added — double-click a label to edit; select & Delete to remove'
                    : r.error || 'Could not add reaction arrow',
                );
              }}
            >
              <ArrowRight size={14} /> Reaction arrow + reagents
            </button>
            <p className="ba-chem-studio-style-note" style={{ margin: '0' }}>
              Places a long reaction arrow with <strong>reagent</strong> and{' '}
              <strong>condition</strong> centered above and below. Double-click a label to edit;
              select a label alone and press Delete to remove it.
            </p>
          </div>

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
            <strong>2D ACS</strong> = draw/edit bonds. <strong>CPK ball &amp; stick</strong> = 3D
            MolView-style 3D viewer — rotate freely, then “Copy this 3D view for figure” (or
            right-click → copy) exports that exact camera as a transparent PNG. Click the active
            style again to return to 2D ACS.
          </p>

          <div className="ba-chem-studio-section-label">Current SMILES</div>
          <input
            className="ba-chem-smiles-input"
            value={smiles}
            onChange={(e) => setSmiles(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!busy) void convertSmilesToStructure();
              }
            }}
            spellCheck={false}
            placeholder="Enter SMILES, then SMILES to structure"
            title="Enter SMILES and press Enter (or use SMILES to structure)"
            disabled={busy}
          />
          <div className="ba-chem-smiles-actions">
            <button
              type="button"
              className="ba-btn ba-btn-primary ba-btn-sm"
              disabled={busy}
              title="Read the selected structure (or whole canvas) and fill the SMILES field"
              onClick={() => void convertStructureToSmiles()}
            >
              Structure to SMILES
            </button>
            <button
              type="button"
              className="ba-btn ba-btn-primary ba-btn-sm"
              disabled={busy || !smiles.trim()}
              title="Parse SMILES and place the structure on the canvas in the selected display style"
              onClick={() => void convertSmilesToStructure()}
            >
              SMILES to structure
            </button>
          </div>
          <p className="ba-chem-studio-style-note" style={{ margin: '4px 12px 8px' }}>
            Enter runs SMILES to structure. Select a molecule, then Structure to SMILES to fill the
            field.
          </p>

          <div className="ba-chem-studio-section-label">Favorites</div>
          <button
            type="button"
            className="ba-btn ba-btn-sm ba-chem-fav-add"
            disabled={busy}
            onClick={() => void addCurrentToFavorites()}
          >
            <Star size={14} /> Add current to favorites
          </button>
          <p className="ba-chem-studio-style-note" style={{ margin: '0 12px 6px' }}>
            Click to add · drag onto canvas to place · right-click for more
          </p>
          <div className="ba-chem-fav-list">
            {favorites.length === 0 && (
              <p className="ba-chem-studio-style-note" style={{ margin: '6px 0' }}>
                No favorites yet. Draw a molecule, then star it for one-click access.
              </p>
            )}
            {favorites.map((fav) => (
              <div
                key={fav.id}
                className="ba-chem-fav-item"
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openFavMenuAt(e.clientX, e.clientY, fav);
                }}
              >
                <button
                  type="button"
                  className="ba-chem-fav-thumb"
                  draggable
                  title={`${fav.name}\n${fav.smiles}\nClick to add · drag onto canvas · right-click for more`}
                  onClick={() => onFavoriteClick(fav)}
                  onDragStart={(e) => onFavoriteDragStart(e, fav)}
                  onDragEnd={() => {
                    // Clear drag flag after browsers that don't synthesize a click
                    window.setTimeout(() => {
                      favDraggedRef.current = false;
                    }, 0);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openFavMenuAt(e.clientX, e.clientY, fav);
                  }}
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
                  title="Favorite actions"
                  aria-label={`Actions for ${fav.name}`}
                  draggable={false}
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    openFavMenuAt(r.right, r.bottom, fav);
                  }}
                >
                  <MoreVertical size={13} />
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
        onAddFavorite={() => void addCurrentToFavorites()}
        onClear={() => void clearSketcher()}
      />
      <ChemFavoriteContextMenu
        menu={favMenu}
        onClose={() => setFavMenu(null)}
        onOpenInSketcher={(fav) => void loadFavorite(fav)}
        onCopyForFigure={(fav) => void copyFavoriteForFigure(fav)}
        onSendToBioArtist={(fav) => void sendFavoriteToBioArtist(fav)}
        onRename={renameFavorite}
        onSaveSvg={downloadFavoriteSvg}
        onCopySmiles={(fav) => void copyFavoriteSmiles(fav)}
        onDuplicate={duplicateFavorite}
        onDelete={deleteFavorite}
      />
    </div>
  );
}
