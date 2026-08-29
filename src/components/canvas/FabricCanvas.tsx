import { Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addImageFromDataUrl,
  addSvgToCanvas,
  clientToScene,
  computeFitScale,
  disposeCanvas,
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
  setCanvasScrollElement,
  setZoom,
} from '../../lib/canvasController';
import { applySessionDocuments } from '../../lib/documentManager';
import { parseIconDragData } from '../../lib/iconDrag';
import { placeLibraryIcon } from '../../lib/placeIcon';
import {
  flushDiskAutosave,
  flushSessionDraft,
  flushSessionDraftSync,
  loadNormalizedSessionDraft,
  markActiveDocumentDirty,
} from '../../lib/sessionDraft';
import { readSvgFiles } from '../../lib/svgImport';
import { useAppStore } from '../../store/appStore';
import { CanvasToolbar } from '../layout/CanvasToolbar';
import { TextFloatingToolbar } from '../text/TextFloatingToolbar';
import {
  CanvasContextMenu,
  type CanvasCtxMenuState,
} from './CanvasContextMenu';
import { FavoritesDock } from './FavoritesDock';

export function FabricCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const stageAreaRef = useRef<HTMLDivElement>(null);
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
  const sessionReadyRef = useRef(false);
  const showGrid = useAppStore((s) => s.showGrid);
  const columnGuides = useAppStore((s) => s.columnGuides);
  const rowGuides = useAppStore((s) => s.rowGuides);
  /** User zoom from store (CSS zoom; Fabric viewport stays 1) */
  const zoom = useAppStore((s) => s.zoom);
  const spacePan = useRef(false);
  const panning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const [fitScale, setFitScale] = useState(1);
  const [ctxMenu, setCtxMenu] = useState<CanvasCtxMenuState | null>(null);

  const updateFitScale = useCallback(() => {
    const el = stageAreaRef.current || workspaceRef.current;
    if (!el) return;
    // clientWidth/Height ignore scrollbars and match the scrollport
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
      onLayers: () => {
        setLayers(getLayers());
        if (sessionReadyRef.current) markActiveDocumentDirty();
      },
      onSelection: () => {
        const { count, props, selectedIds } = getSelectionProps();
        setSelection(count, props, selectedIds);
      },
      onHistory: (u, r) => {
        setHistoryFlags(u, r);
        if (sessionReadyRef.current && u) markActiveDocumentDirty();
      },
      onZoom: (z) => setZoomState(z),
      onObjectCount: (n) => {
        setObjectCount(n);
        if (sessionReadyRef.current) markActiveDocumentDirty();
      },
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
    void loadNormalizedSessionDraft()
      .then(async (session) => {
        if (session?.documents?.length) {
          const active = applySessionDocuments(
            session.documents,
            session.activeDocumentId,
          );
          const snap = active?.snapshot;
          if (active && snap?.canvas) {
            await importJSON({
              canvas: snap.canvas,
              artboard: snap.artboard || {
                width: active.artboardWidth,
                height: active.artboardHeight,
              },
            });
            setProjectName(active.name);
            setArtboardSize(active.artboardWidth, active.artboardHeight);
          }
          fitToScreen();
          updateFitScale();
          if (session.documents.length > 1) {
            showToast(
              `Restored ${session.documents.length} open figures from autosave`,
            );
          }
        } else {
          fitToScreen();
          updateFitScale();
        }
      })
      .finally(() => {
        sessionReadyRef.current = true;
      });

    const saveDraftNow = () => {
      void flushSessionDraft().then(() => {
        void flushDiskAutosave();
      });
    };
    const autosave = window.setInterval(saveDraftNow, 8000);
    const onBeforeUnload = () => {
      flushSessionDraftSync();
    };
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

  // Register scrollport for panBy / zoom anchoring
  useEffect(() => {
    setCanvasScrollElement(stageAreaRef.current);
    return () => setCanvasScrollElement(null);
  }, []);

  // Keep artboard visually fitted inside the workspace as the window resizes
  useEffect(() => {
    const el = stageAreaRef.current || workspaceRef.current;
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
    // ⌘/Ctrl + scroll → zoom (stage grows; scrollbars appear when larger than view)
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      setZoom(getZoom() + delta, { clientX: e.clientX, clientY: e.clientY });
      return;
    }
    // Otherwise let the browser scroll the stage area natively (H + V scrollbars).
    // Shift+wheel → horizontal scroll is handled by the browser on most platforms.
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
        // Favorites / library drag — place under the cursor
        await placeLibraryIcon(dragged, { left, top });
        showToast(`Placed “${dragged.name}”`);
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

  // Display scale = fit-into-window × user zoom. Stage box matches so overflow scrolls.
  const displayScale = fitScale * Math.max(0.25, Math.min(3, zoom || 1));
  const stageW = Math.round(artboardWidth * displayScale);
  const stageH = Math.round(artboardHeight * displayScale);

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
      {/* Canvas-column tools only (Snap → Copy); wraps within this column */}
      <CanvasToolbar />

      <div
        ref={stageAreaRef}
        className="ba-workspace-stage-area"
      >
        {/* Spacer centers the stage when smaller than the view; scrolls when larger */}
        <div
          className="ba-workspace-scroll-inner"
          style={{
            minWidth: '100%',
            minHeight: '100%',
            width: stageW,
            height: stageH,
          }}
        >
          <div
            className="ba-canvas-stage"
            style={{ width: stageW, height: stageH }}
            onContextMenu={onContextMenu}
          >
            {/* Anchored to artboard top edge; expands upward (never under Snap/Zoom bar) */}
            <TextFloatingToolbar />
            <div
              ref={wrapRef}
              className={`ba-canvas-wrap ${showGrid ? 'ba-grid' : ''}`}
              style={{
                width: artboardWidth,
                height: artboardHeight,
                transform: `scale(${displayScale})`,
                position: 'relative',
              }}
            >
              <canvas ref={canvasRef} />
              {/* Layout guides — visual only, not exported; visibility follows Grid button */}
              {showGrid && (columnGuides >= 2 || rowGuides >= 2) && (
                <div className="ba-layout-guides" aria-hidden>
                  {columnGuides >= 2 &&
                    Array.from({ length: columnGuides - 1 }, (_, i) => {
                      const pct = ((i + 1) / columnGuides) * 100;
                      return (
                        <div
                          key={`c-${i}`}
                          className="ba-layout-guide ba-layout-guide-col"
                          style={{ left: `${pct}%` }}
                        />
                      );
                    })}
                  {rowGuides >= 2 &&
                    Array.from({ length: rowGuides - 1 }, (_, i) => {
                      const pct = ((i + 1) / rowGuides) * 100;
                      return (
                        <div
                          key={`r-${i}`}
                          className="ba-layout-guide ba-layout-guide-row"
                          style={{ top: `${pct}%` }}
                        />
                      );
                    })}
                </div>
              )}
              {objectCount === 0 && (
                <div className="ba-canvas-empty">
                  <h2>Start your figure</h2>
                  <p>
                    Browse biology icons on the left, or import SVG / PNG into My Library. Drag onto
                    the canvas to compose publication-style figures.
                  </p>
                  <div className="ba-canvas-empty-actions">
                    <button
                      className="ba-btn ba-btn-primary"
                      onClick={() => setLibraryTab('library')}
                    >
                      Browse icons
                    </button>
                    <button className="ba-btn" onClick={() => setLibraryTab('uploads')}>
                      <Upload size={14} /> Import assets
                    </button>
                  </div>
                  <div className="ba-canvas-empty-hint">
                    Scroll when zoomed · Space+drag to pan · ⌘/Ctrl+scroll to zoom · Favorites dock
                    below
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <FavoritesDock />

      <CanvasContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} />
    </div>
  );
}
