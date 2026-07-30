import { Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addImageFromDataUrl,
  addSvgToCanvas,
  clientToScene,
  computeFitScale,
  disposeCanvas,
  exportJSON,
  fetchSvgText,
  fitToScreen,
  getLayers,
  getSelectionCount,
  getSelectionProps,
  getZoom,
  importJSON,
  initCanvas,
  panBy,
  bindCanvasContextMenu,
  selectTargetAtEvent,
  setArtboardSize as setCanvasArtboard,
  setCanvasListeners,
  setZoom,
} from '../../lib/canvasController';
import { parseIconDragData } from '../../lib/iconDrag';
import { readSvgFiles } from '../../lib/svgImport';
import { loadDraft, saveDraft, useAppStore } from '../../store/appStore';
import {
  CanvasContextMenu,
  type CanvasCtxMenuState,
} from './CanvasContextMenu';
import { FavoritesDock } from './FavoritesDock';

export function FabricCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const setLayers = useAppStore((s) => s.setLayers);
  const setSelection = useAppStore((s) => s.setSelection);
  const setHistoryFlags = useAppStore((s) => s.setHistoryFlags);
  const setZoomState = useAppStore((s) => s.setZoom);
  const addUserIcons = useAppStore((s) => s.addUserIcons);
  const showToast = useAppStore((s) => s.showToast);
  const setProjectName = useAppStore((s) => s.setProjectName);
  const setLibraryTab = useAppStore((s) => s.setLibraryTab);
  const setObjectCount = useAppStore((s) => s.setObjectCount);
  const setArtboardSize = useAppStore((s) => s.setArtboardSize);
  const objectCount = useAppStore((s) => s.objectCount);
  const artboardWidth = useAppStore((s) => s.artboardWidth);
  const artboardHeight = useAppStore((s) => s.artboardHeight);
  const showGrid = useAppStore((s) => s.showGrid);
  const columnGuides = useAppStore((s) => s.columnGuides);
  const spacePan = useRef(false);
  const panning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const [fitScale, setFitScale] = useState(1);
  const [ctxMenu, setCtxMenu] = useState<CanvasCtxMenuState | null>(null);

  const updateFitScale = useCallback(() => {
    const el = workspaceRef.current;
    if (!el) return;
    // clientWidth/Height ignore scrollbars and match the grid cell after shrink
    const width = el.clientWidth || el.getBoundingClientRect().width;
    const height = el.clientHeight || el.getBoundingClientRect().height;
    if (width < 8 || height < 8) return;
    const next = computeFitScale(width, height, artboardWidth, artboardHeight);
    setFitScale((prev) => (Math.abs(prev - next) < 0.002 ? prev : next));
  }, [artboardWidth, artboardHeight]);

  useEffect(() => {
    if (!canvasRef.current) return;

    initCanvas(canvasRef.current);
    setCanvasArtboard(artboardWidth, artboardHeight);
    setCanvasListeners({
      onLayers: () => setLayers(getLayers()),
      onSelection: () => {
        const { count, props, selectedIds } = getSelectionProps();
        setSelection(count, props, selectedIds);
      },
      onHistory: (u, r) => setHistoryFlags(u, r),
      onZoom: (z) => setZoomState(z),
      onObjectCount: (n) => setObjectCount(n),
    });

    // Native right-click on Fabric upper canvas (React bubble alone is unreliable)
    const unbindCtx = bindCanvasContextMenu((e) => {
      try {
        const onObject = selectTargetAtEvent(e);
        const { count, props, selectedIds } = getSelectionProps();
        setSelection(count, props, selectedIds);
        setCtxMenu({
          x: e.clientX,
          y: e.clientY,
          onObject: onObject || count > 0,
        });
      } catch (err) {
        console.error('context menu', err);
        setCtxMenu({ x: e.clientX, y: e.clientY, onObject: false });
      }
    });

    void useAppStore.getState().hydrateLibrary();
    void loadDraft<{
      projectName?: string;
      canvas?: unknown;
      artboard?: { width: number; height: number };
    }>().then((draft) => {
      if (draft?.canvas) {
        void importJSON({ canvas: draft.canvas, artboard: draft.artboard }).then(() => {
          if (draft.projectName) setProjectName(draft.projectName);
          if (draft.artboard) {
            setArtboardSize(draft.artboard.width, draft.artboard.height);
          }
          fitToScreen();
          updateFitScale();
        });
      } else {
        fitToScreen();
        updateFitScale();
      }
    });

    const saveDraftNow = () => {
      const data = exportJSON();
      if (data) {
        saveDraft({
          ...data,
          projectName: useAppStore.getState().projectName,
          savedAt: new Date().toISOString(),
        });
      }
    };
    const autosave = window.setInterval(saveDraftNow, 8000);
    const onBeforeUnload = () => saveDraftNow();
    window.addEventListener('beforeunload', onBeforeUnload);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.closest('input,textarea,[contenteditable]')) {
        e.preventDefault();
        spacePan.current = true;
        document.body.style.cursor = 'grab';
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spacePan.current = false;
        panning.current = false;
        document.body.style.cursor = '';
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      unbindCtx();
      window.clearInterval(autosave);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      disposeCanvas();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep artboard visually fitted inside the workspace as the window resizes
  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;

    updateFitScale();

    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        updateFitScale();
      });
    });
    ro.observe(el);
    window.addEventListener('resize', updateFitScale);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', updateFitScale);
    };
  }, [updateFitScale]);

  // Artboard size change → re-fit
  useEffect(() => {
    setCanvasArtboard(artboardWidth, artboardHeight);
    updateFitScale();
  }, [artboardWidth, artboardHeight, updateFitScale]);

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      setZoom(getZoom() + delta);
    } else if (e.shiftKey) {
      e.preventDefault();
      panBy(-e.deltaY, 0);
    } else {
      // two-finger pan feel
      panBy(-e.deltaX, -e.deltaY);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (spacePan.current || e.button === 1) {
      panning.current = true;
      lastPos.current = { x: e.clientX, y: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      document.body.style.cursor = 'grabbing';
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!panning.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    panBy(dx, dy);
  };

  const onPointerUp = () => {
    panning.current = false;
    document.body.style.cursor = spacePan.current ? 'grab' : '';
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const el = wrapRef.current;
    const { x: left, y: top } = el
      ? clientToScene(e.clientX, e.clientY, el)
      : { x: artboardWidth / 2, y: artboardHeight / 2 };

    const dragged = parseIconDragData(e.dataTransfer);
    if (dragged) {
      try {
        if (dragged.path?.startsWith('data:image') && !dragged.path.includes('svg+xml')) {
          await addImageFromDataUrl(dragged.path, { left, top, name: dragged.name });
          return;
        }
        let svg = dragged.svgContent;
        if (!svg && dragged.path && !dragged.path.startsWith('data:')) {
          svg = await fetchSvgText(dragged.path);
        }
        if (svg) await addSvgToCanvas(svg, { left, top, name: dragged.name });
      } catch {
        showToast('Could not place icon');
      }
      return;
    }

    if (e.dataTransfer.files?.length) {
      const files = Array.from(e.dataTransfer.files);
      const svgs = files.filter((f) => f.name.endsWith('.svg') || f.type === 'image/svg+xml');
      const images = files.filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f.name));

      if (svgs.length) {
        const icons = await readSvgFiles(svgs);
        if (icons.length) {
          const ok = await addUserIcons(icons);
          if (ok) {
            showToast(`Imported ${icons.length} SVG${icons.length > 1 ? 's' : ''} to My Library`);
          }
          for (let i = 0; i < icons.length; i++) {
            if (icons[i].svgContent) {
              await addSvgToCanvas(icons[i].svgContent!, {
                left: left + i * 30,
                top: top + i * 20,
                name: icons[i].name,
              });
            }
          }
        }
      }
      if (images.length) {
        const rasterIcons = [];
        for (let i = 0; i < images.length; i++) {
          const file = images[i];
          const dataUrl = await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result));
            r.onerror = () => rej(r.error);
            r.readAsDataURL(file);
          });
          const name = file.name.replace(/\.[^.]+$/, '');
          rasterIcons.push({
            id: `user/img-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            name,
            category: 'symbols' as const,
            path: dataUrl,
            source: 'user' as const,
          });
          await addImageFromDataUrl(dataUrl, {
            left: left + i * 30,
            top: top + i * 20,
            name,
          });
        }
        const ok = await addUserIcons(rasterIcons);
        if (ok) {
          showToast(
            `Imported ${rasterIcons.length} image${rasterIcons.length > 1 ? 's' : ''} to My Library`,
          );
        }
      }
    }
  };

  const stageW = Math.round(artboardWidth * fitScale);
  const stageH = Math.round(artboardHeight * fitScale);

  const onContextMenu = (e: React.MouseEvent) => {
    // Fallback for right-clicks that hit stage chrome / empty overlay (not fabric upper canvas)
    e.preventDefault();
    e.stopPropagation();
    try {
      const onObject = selectTargetAtEvent(e.nativeEvent);
      const { count, props, selectedIds } = getSelectionProps();
      setSelection(count, props, selectedIds);
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        onObject: onObject || getSelectionCount() > 0,
      });
    } catch (err) {
      console.error(err);
      setCtxMenu({ x: e.clientX, y: e.clientY, onObject: false });
    }
  };

  return (
    <div
      ref={workspaceRef}
      className="ba-workspace"
      onWheel={onWheel}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(ev) => void onDrop(ev)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        className="ba-canvas-stage"
        style={{ width: stageW, height: stageH }}
        onContextMenu={onContextMenu}
      >
        <div
          ref={wrapRef}
          className={`ba-canvas-wrap ${showGrid ? 'ba-grid' : ''}`}
          style={{
            width: artboardWidth,
            height: artboardHeight,
            transform: `scale(${fitScale})`,
            position: 'relative',
          }}
        >
          <canvas ref={canvasRef} />
          {/* Imaginary vertical column guides (not exported) */}
          {columnGuides >= 2 && (
            <div className="ba-column-guides" aria-hidden>
              {Array.from({ length: columnGuides - 1 }, (_, i) => {
                const pct = ((i + 1) / columnGuides) * 100;
                return (
                  <div
                    key={i}
                    className="ba-column-guide"
                    style={{ left: `${pct}%` }}
                  />
                );
              })}
            </div>
          )}
          {objectCount === 0 && (
            <div className="ba-canvas-empty">
              <h2>Start your figure</h2>
              <p>
                Browse biology icons on the left, or import SVG / PNG into My Library. Drag onto the
                canvas to compose publication-style figures.
              </p>
              <div className="ba-canvas-empty-actions">
                <button className="ba-btn ba-btn-primary" onClick={() => setLibraryTab('library')}>
                  Browse icons
                </button>
                <button className="ba-btn" onClick={() => setLibraryTab('uploads')}>
                  <Upload size={14} /> Import assets
                </button>
              </div>
              <div className="ba-canvas-empty-hint">
                Space+drag to pan · ⌘/Ctrl+scroll to zoom · Grid / Snap in the top bar · Favorites
                dock below
              </div>
            </div>
          )}
        </div>
      </div>

      <FavoritesDock />

      <CanvasContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} />
    </div>
  );
}
