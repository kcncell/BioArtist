import {
  ArrowDownToLine,
  ArrowUpToLine,
  Check,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Crop,
  Download,
  Eraser,
  Group,
  RotateCcw,
  Scissors,
  Star,
  Trash2,
  Ungroup,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import {
  beginCropMode,
  bringForward,
  bringToFront,
  copySelectionToClipboard,
  cutSelectionToClipboard,
  deleteSelection,
  downloadSelectionSvg,
  duplicateSelection,
  endCropMode,
  getSelectionCount,
  groupSelection,
  hasObjectClipboard,
  isCropModeActive,
  pasteObjectClipboard,
  removeSolidBackgroundFromSelection,
  resetSelectionCrop,
  selectionAsLibraryIcon,
  selectionIsCroppable,
  selectionIsGroup,
  selectionIsRasterImage,
  sendBackward,
  sendToBack,
  ungroupSelection,
} from '../../lib/canvasController';
import {
  enrichSnapFromAsyncClipboard,
  pasteOntoCanvas,
  pasteResultToLibraryIcon,
  resolveChemStudioOrClipboard,
  type ClipboardSnap,
} from '../../lib/clipboardPaste';
import { useAppStore } from '../../store/appStore';
import { ContextMenu } from '../ui/ContextMenu';

export type CanvasCtxMenuState = {
  x: number;
  y: number;
  /** true when right-click hit an object (or multi-selection) */
  onObject: boolean;
};

type Props = {
  menu: CanvasCtxMenuState | null;
  onClose: () => void;
};

function Sep() {
  return <div className="ba-ctx-sep" role="separator" />;
}

export function CanvasContextMenu({ menu, onClose }: Props) {
  const showToast = useAppStore((s) => s.showToast);
  const addFavorite = useAppStore((s) => s.addFavorite);
  const addUserIcons = useAppStore((s) => s.addUserIcons);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // Snapshot whether we had a selection when the menu opened (don't re-read mid-click)
  const onObjectRef = useRef(false);
  const canGroupRef = useRef(false);
  const canUngroupRef = useRef(false);
  const canRemoveBgRef = useRef(false);
  const canCropRef = useRef(false);
  const inCropModeRef = useRef(false);

  if (menu) {
    const count = getSelectionCount();
    onObjectRef.current = menu.onObject && count > 0;
    canGroupRef.current = count >= 2;
    canUngroupRef.current = selectionIsGroup();
    canRemoveBgRef.current = selectionIsRasterImage();
    canCropRef.current = selectionIsCroppable();
    inCropModeRef.current = isCropModeActive();
  }

  useEffect(() => {
    if (!menu) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    // Close only when pressing *outside* the menu. Capture-phase pointerdown
    // used to fire before button click and unmount the menu — so actions never ran.
    const onPointerDown = (e: PointerEvent) => {
      const root = menuRef.current;
      const t = e.target as Node | null;
      if (root && t && root.contains(t)) return;
      onClose();
    };

    const t = window.setTimeout(() => {
      window.addEventListener('pointerdown', onPointerDown, true);
      window.addEventListener('keydown', onKey);
      window.addEventListener('scroll', onClose, true);
    }, 0);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const onObject = onObjectRef.current;
  const canGroup = canGroupRef.current;
  const canUngroup = canUngroupRef.current;
  const canRemoveBg = canRemoveBgRef.current;
  const canCrop = canCropRef.current;
  const inCropMode = inCropModeRef.current;

  /** Run a sync canvas action, then close the menu. */
  const act = (label: string, fn: () => void) => {
    try {
      fn();
      showToast(label);
    } catch (err) {
      console.error(label, err);
      showToast(`Could not ${label.toLowerCase()}`);
    } finally {
      onClose();
    }
  };

  /** Run an async canvas action, then close. */
  const actAsync = async (label: string, fn: () => Promise<boolean | void>) => {
    try {
      const ok = await fn();
      if (ok === false) {
        showToast(`Could not ${label.toLowerCase()}`);
      } else {
        showToast(label);
      }
    } catch (err) {
      console.error(label, err);
      showToast(`Could not ${label.toLowerCase()}`);
    } finally {
      onClose();
    }
  };

  const onPaste = async () => {
    try {
      let snap: ClipboardSnap = {
        plain: '',
        html: '',
        extras: [],
        files: [],
        imageBlobs: [],
        svgBlobs: [],
        types: [],
      };
      // Async Clipboard API (required for right-click paste — no ClipboardEvent data)
      snap = await enrichSnapFromAsyncClipboard(snap);
      let result = await resolveChemStudioOrClipboard(snap);

      if (result.kind === 'none' && hasObjectClipboard()) {
        const ok = await pasteObjectClipboard();
        if (ok) {
          showToast('Pasted');
          return;
        }
      }

      if (result.kind === 'none') {
        showToast(
          'Nothing to paste — copy from Bioicons, Excalidraw (⌘/Ctrl+C), or Chem Studio',
        );
        return;
      }
      const placed = await pasteOntoCanvas(result);
      if (!placed) {
        showToast('Could not paste');
        return;
      }
      const icon = pasteResultToLibraryIcon(result);
      if (icon) await addUserIcons([icon], { stayOnTool: true });
      const isExcal = (result.name || '').toLowerCase().includes('excalidraw');
      showToast(
        result.kind === 'chem'
          ? `Pasted molecule “${result.name || 'structure'}”`
          : result.kind === 'svg'
            ? isExcal
              ? 'Pasted Excalidraw figure'
              : `Pasted SVG “${result.name || 'icon'}”`
            : 'Pasted image',
      );
    } catch (e) {
      console.error(e);
      showToast(
        e instanceof Error
          ? `Paste failed: ${e.message}`
          : 'Paste failed — re-copy, then try again (Chrome/Edge recommended)',
      );
    } finally {
      onClose();
    }
  };

  const onAddFavorite = () => {
    try {
      const icon = selectionAsLibraryIcon();
      if (!icon) {
        showToast('Select an object first');
        return;
      }
      const ok = addFavorite(icon);
      showToast(
        ok
          ? `Added “${icon.name}” to favorites`
          : `“${icon.name}” is already in favorites`,
      );
    } catch (e) {
      console.error(e);
      showToast('Could not add to favorites');
    } finally {
      onClose();
    }
  };

  const onSaveSvg = () => {
    try {
      const name = useAppStore.getState().selectionProps?.name || 'selection';
      const ok = downloadSelectionSvg(`${name}.svg`);
      showToast(ok ? 'SVG downloaded' : 'Could not export selection');
    } catch (e) {
      console.error(e);
      showToast('Could not save SVG');
    } finally {
      onClose();
    }
  };

  return (
    <ContextMenu ref={menuRef} x={menu.x} y={menu.y}>
      <button
        type="button"
        role="menuitem"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => void onPaste()}
      >
        <ClipboardPaste size={14} /> Paste
        <span className="ba-ctx-kbd">⌘V</span>
      </button>

      {onObject && (
        <>
          <Sep />
          <button
            type="button"
            role="menuitem"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() =>
              void actAsync('Cut', async () => {
                const ok = await cutSelectionToClipboard();
                return ok;
              })
            }
          >
            <Scissors size={14} /> Cut
            <span className="ba-ctx-kbd">⌘X</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() =>
              void actAsync('Copied', async () => {
                const ok = await copySelectionToClipboard();
                return ok;
              })
            }
          >
            <ClipboardCopy size={14} /> Copy
            <span className="ba-ctx-kbd">⌘C</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() =>
              act('Duplicated', () => {
                duplicateSelection();
              })
            }
          >
            <Copy size={14} /> Duplicate
            <span className="ba-ctx-kbd">⌘D</span>
          </button>

          <Sep />
          <button
            type="button"
            role="menuitem"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => act('Brought to front', () => bringToFront())}
          >
            <ArrowUpToLine size={14} /> Bring to front
          </button>
          <button
            type="button"
            role="menuitem"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => act('Brought forward', () => bringForward())}
          >
            Bring forward
          </button>
          <button
            type="button"
            role="menuitem"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => act('Sent backward', () => sendBackward())}
          >
            Send backward
          </button>
          <button
            type="button"
            role="menuitem"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => act('Sent to back', () => sendToBack())}
          >
            <ArrowDownToLine size={14} /> Send to back
          </button>

          {(canGroup || canUngroup) && <Sep />}
          {canGroup && (
            <button
              type="button"
              role="menuitem"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => act('Grouped', () => groupSelection())}
            >
              <Group size={14} /> Group
              <span className="ba-ctx-kbd">⌘G</span>
            </button>
          )}
          {canUngroup && (
            <button
              type="button"
              role="menuitem"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => act('Ungrouped', () => ungroupSelection())}
            >
              <Ungroup size={14} /> Ungroup
            </button>
          )}

          <Sep />
          <button
            type="button"
            role="menuitem"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onAddFavorite}
          >
            <Star size={14} /> Add to favorites
          </button>
          <button
            type="button"
            role="menuitem"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onSaveSvg}
          >
            <Download size={14} /> Save as SVG
          </button>

          {canCrop && (
            <>
              <Sep />
              {inCropMode ? (
                <button
                  type="button"
                  role="menuitem"
                  title="Finish cropping (keeps current crop)"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() =>
                    act('Crop applied', () => {
                      endCropMode();
                    })
                  }
                >
                  <Check size={14} /> Apply crop
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  title="Crop from all four sides — drag the side handles"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() =>
                    act('Crop mode — drag sides · Esc to finish', () => {
                      const ok = beginCropMode();
                      if (!ok) throw new Error('Not croppable');
                    })
                  }
                >
                  <Crop size={14} /> Crop
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                title="Clear crop and show the full figure"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() =>
                  act('Crop reset', () => {
                    const ok = resetSelectionCrop();
                    if (!ok) throw new Error('Could not reset crop');
                  })
                }
              >
                <RotateCcw size={14} /> Reset crop
              </button>
            </>
          )}

          {canRemoveBg && (
            <>
              <Sep />
              <button
                type="button"
                role="menuitem"
                title="Make near-white / solid background transparent (hard edges)"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  void (async () => {
                    try {
                      const result = await removeSolidBackgroundFromSelection({
                        tolerance: 28,
                        color: { r: 255, g: 255, b: 255 },
                      });
                      if (!result.ok) {
                        showToast(result.error || 'Could not remove background');
                      } else {
                        showToast(
                          `Background removed (${result.removed?.toLocaleString() ?? '?'} pixels)`,
                        );
                      }
                    } catch (err) {
                      console.error(err);
                      showToast('Could not remove background');
                    } finally {
                      onClose();
                    }
                  })();
                }}
              >
                <Eraser size={14} /> Remove white background
              </button>
            </>
          )}

          <Sep />
          <button
            type="button"
            role="menuitem"
            className="danger"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => act('Deleted', () => deleteSelection())}
          >
            <Trash2 size={14} /> Delete
            <span className="ba-ctx-kbd">⌫</span>
          </button>
        </>
      )}

      {!onObject && (
        <>
          <Sep />
          <button type="button" role="menuitem" disabled title="Select an object first">
            Cut / Copy need a selection
          </button>
        </>
      )}
    </ContextMenu>
  );
}
