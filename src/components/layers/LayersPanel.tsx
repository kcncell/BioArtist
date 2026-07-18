import { Eye, EyeOff, GripVertical, Lock, Unlock } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  renameLayer,
  reorderLayer,
  selectById,
  toggleLock,
  toggleVisibility,
} from '../../lib/canvasController';
import { useAppStore } from '../../store/appStore';

export function LayersPanel() {
  const layers = useAppStore((s) => s.layers);
  const selectionProps = useAppStore((s) => s.selectionProps);
  const selectedIds = useAppStore((s) => s.selectedIds);
  const primaryId = selectedIds[0];

  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dropPlace, setDropPlace] = useState<'before' | 'after'>('before');
  const dragIdRef = useRef<string | null>(null);

  const onDragStart = (e: React.DragEvent, id: string) => {
    dragIdRef.current = id;
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    // Improve drag ghost in some browsers
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
    // Only clear if leaving the row entirely
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

  return (
    <div className="ba-right-section layers">
      <div className="ba-panel-header">
        Layers
        <span style={{ fontWeight: 400, color: 'var(--ba-text-secondary)', fontSize: 11 }}>
          {layers.length}
        </span>
      </div>
      <div className="ba-panel-sub" style={{ paddingTop: 0, paddingBottom: 6 }}>
        Drag rows to reorder · top = front
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
              >
                <span className="ba-layer-grip" title="Drag to reorder" aria-hidden>
                  <GripVertical size={14} />
                </span>
                <span className="name" title={layer.name}>
                  {layer.name}
                </span>
                <div className="ba-layer-actions">
                  <button
                    title={layer.visible ? 'Hide' : 'Show'}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleVisibility(layer.id);
                    }}
                  >
                    {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button
                    title={layer.locked ? 'Unlock' : 'Lock'}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLock(layer.id);
                    }}
                  >
                    {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
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
    </div>
  );
}
