import {
  ArrowDownToLine,
  ArrowUpToLine,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  MoreVertical,
  Trash2,
  Unlock,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  bringLayerForward,
  bringLayerToFront,
  deleteLayerById,
  renameLayer,
  reorderLayer,
  selectById,
  sendLayerBackward,
  sendLayerToBack,
  toggleLock,
  toggleVisibility,
} from '../../lib/canvasController';
import { useAppStore } from '../../store/appStore';
import { ContextMenu } from '../ui/ContextMenu';

type LayerMenuState = {
  x: number;
  y: number;
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
};

export function LayersPanel() {
  const layers = useAppStore((s) => s.layers);
  const selectionProps = useAppStore((s) => s.selectionProps);
  const selectedIds = useAppStore((s) => s.selectedIds);
  const showToast = useAppStore((s) => s.showToast);
  const primaryId = selectedIds[0];

  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dropPlace, setDropPlace] = useState<'before' | 'after'>('before');
  const [ctxMenu, setCtxMenu] = useState<LayerMenuState | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const onDragStart = (e: React.DragEvent, id: string) => {
    dragIdRef.current = id;
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 12, 16);
    }
  };

  const onDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const place: 'before' | 'after' = e.clientY < mid ? 'before' : 'after';
    setOverId(id);
    setDropPlace(place);
  };

  const onDragLeave = (e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    setOverId(null);
  };

  const onDrop = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    const dragged = dragIdRef.current || e.dataTransfer.getData('text/plain');
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const place: 'before' | 'after' = e.clientY < mid ? 'before' : 'after';
    if (dragged && dragged !== id) {
      reorderLayer(dragged, id, place);
    }
    setDragId(null);
    setOverId(null);
    dragIdRef.current = null;
  };

  const onDragEnd = () => {
    setDragId(null);
    setOverId(null);
    dragIdRef.current = null;
  };

  const openLayerMenu = (
    e: React.MouseEvent,
    layer: { id: string; name: string; visible: boolean; locked: boolean },
  ) => {
    e.preventDefault();
    e.stopPropagation();
    selectById(layer.id);
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      locked: layer.locked,
    });
  };

  useEffect(() => {
    if (!ctxMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxMenu(null);
    };
    const onPointerDown = (e: PointerEvent) => {
      const root = menuRef.current;
      const t = e.target as Node | null;
      if (root && t && root.contains(t)) return;
      setCtxMenu(null);
    };
    const t = window.setTimeout(() => {
      window.addEventListener('pointerdown', onPointerDown, true);
      window.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);

  const runLayerAction = (label: string, fn: () => void) => {
    try {
      fn();
      showToast(label);
    } catch (err) {
      console.error(label, err);
      showToast(`Could not ${label.toLowerCase()}`);
    } finally {
      setCtxMenu(null);
    }
  };

  return (
    <div className="ba-right-section layers">
      <div className="ba-panel-header">
        Layers
        <span style={{ fontWeight: 400, color: 'var(--ba-text-secondary)', fontSize: 11 }}>
          {layers.length}
        </span>
      </div>
      <div className="ba-panel-sub" style={{ paddingTop: 0, paddingBottom: 6 }}>
        Drag to reorder · right-click for more · top = front
      </div>

      {layers.length === 0 ? (
        <div className="ba-empty">Objects you add will show up here as layers (top = front).</div>
      ) : (
        <div className="ba-layer-list">
          {layers.map((layer) => {
            const selected = selectedIds.includes(layer.id);
            const isDragging = dragId === layer.id;
            const isOver = overId === layer.id && dragId && dragId !== layer.id;
            return (
              <div
                key={layer.id}
                className={[
                  'ba-layer-item',
                  selected ? 'selected' : '',
                  isDragging ? 'dragging' : '',
                  isOver ? `drop-${dropPlace}` : '',
                  !layer.visible ? 'hidden-layer' : '',
                  layer.locked ? 'locked-layer' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                draggable
                onDragStart={(e) => onDragStart(e, layer.id)}
                onDragOver={(e) => onDragOver(e, layer.id)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, layer.id)}
                onDragEnd={onDragEnd}
                onClick={() => selectById(layer.id)}
                onContextMenu={(e) => openLayerMenu(e, layer)}
              >
                <span className="ba-layer-grip" title="Drag to reorder" aria-hidden>
                  <GripVertical size={14} />
                </span>
                <span className="name" title={layer.name}>
                  {layer.name}
                </span>
                <div className="ba-layer-actions">
                  <button
                    type="button"
                    title={layer.visible ? 'Hide' : 'Show'}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleVisibility(layer.id);
                    }}
                  >
                    {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button
                    type="button"
                    title={layer.locked ? 'Unlock' : 'Lock'}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLock(layer.id);
                    }}
                  >
                    {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
                  </button>
                  <button
                    type="button"
                    title="Delete layer"
                    className="ba-layer-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      const ok = deleteLayerById(layer.id);
                      showToast(ok ? `Deleted “${layer.name}”` : 'Could not delete layer');
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                  <button
                    type="button"
                    title="More actions"
                    aria-label={`More actions for ${layer.name}`}
                    onClick={(e) => openLayerMenu(e, layer)}
                  >
                    <MoreVertical size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {layers.length > 0 && primaryId && (
        <div className="ba-field" style={{ paddingBottom: 12 }}>
          <label>Rename selected layer</label>
          <input
            type="text"
            placeholder="Layer name"
            defaultValue={selectionProps?.name || ''}
            key={primaryId}
            onBlur={(e) => {
              if (e.target.value.trim()) {
                renameLayer(primaryId, e.target.value.trim());
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        </div>
      )}

      {ctxMenu && (
        <ContextMenu ref={menuRef} x={ctxMenu.x} y={ctxMenu.y}>
          <div className="ba-ctx-heading" title={ctxMenu.name}>
            {ctxMenu.name}
          </div>
          <button
            type="button"
            role="menuitem"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() =>
              runLayerAction(ctxMenu.visible ? 'Hidden' : 'Shown', () => {
                toggleVisibility(ctxMenu.id);
              })
            }
          >
            {ctxMenu.visible ? <EyeOff size={14} /> : <Eye size={14} />}
            {ctxMenu.visible ? 'Hide' : 'Show'}
          </button>
          <button
            type="button"
            role="menuitem"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() =>
              runLayerAction(ctxMenu.locked ? 'Unlocked' : 'Locked', () => {
                toggleLock(ctxMenu.id);
              })
            }
          >
            {ctxMenu.locked ? <Unlock size={14} /> : <Lock size={14} />}
            {ctxMenu.locked ? 'Unlock' : 'Lock'}
          </button>
          <div className="ba-ctx-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() =>
              runLayerAction('Brought to front', () => {
                bringLayerToFront(ctxMenu.id);
              })
            }
          >
            <ArrowUpToLine size={14} /> Bring to front
          </button>
          <button
            type="button"
            role="menuitem"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() =>
              runLayerAction('Brought forward', () => {
                bringLayerForward(ctxMenu.id);
              })
            }
          >
            Bring forward
          </button>
          <button
            type="button"
            role="menuitem"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() =>
              runLayerAction('Sent backward', () => {
                sendLayerBackward(ctxMenu.id);
              })
            }
          >
            Send backward
          </button>
          <button
            type="button"
            role="menuitem"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() =>
              runLayerAction('Sent to back', () => {
                sendLayerToBack(ctxMenu.id);
              })
            }
          >
            <ArrowDownToLine size={14} /> Send to back
          </button>
          <div className="ba-ctx-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="danger"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() =>
              runLayerAction(`Deleted “${ctxMenu.name}”`, () => {
                const ok = deleteLayerById(ctxMenu.id);
                if (!ok) throw new Error('delete failed');
              })
            }
          >
            <Trash2 size={14} /> Delete
          </button>
        </ContextMenu>
      )}
    </div>
  );
}
