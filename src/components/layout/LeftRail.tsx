import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Hexagon,
  LayoutTemplate,
  Library,
  Package,
  Pencil,
  Settings2,
  Shapes,
  Sparkles,
  Star,
  Type,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DEFAULT_RAIL_ITEMS,
  getVisibleRailItems,
  loadRailHidden,
  loadRailOrder,
  saveRailHidden,
  saveRailOrder,
  type RailToolId,
} from '../../lib/railConfig';
import { useAppStore } from '../../store/appStore';
import type { ToolId } from '../../types';

/** 45° arrow only — Lines / connectors tool */
function LinesRailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M4 14 L14 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M9 4 H14 V9"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Compact NIH / SMA text badges for the rail */
function TextRailIcon({ label }: { label: string }) {
  return (
    <span className="ba-rail-text-icon" aria-hidden>
      {label}
    </span>
  );
}

const RAIL_ICONS: Record<RailToolId, React.ReactNode> = {
  library: <Library size={18} strokeWidth={1.75} />,
  bioicons: <Package size={18} strokeWidth={1.75} />,
  nih: <TextRailIcon label="NIH" />,
  servier: <TextRailIcon label="SMA" />,
  chem: <Hexagon size={18} strokeWidth={1.75} />,
  ai: <Sparkles size={18} strokeWidth={1.75} />,
  excalidraw: <Pencil size={18} strokeWidth={1.75} />,
  templates: <LayoutTemplate size={18} />,
  pdb: <TextRailIcon label="PDB" />,
  shapes: <Shapes size={18} />,
  lines: <LinesRailIcon />,
  text: <Type size={18} />,
};

function itemDef(id: RailToolId) {
  return DEFAULT_RAIL_ITEMS.find((i) => i.id === id)!;
}

export function LeftRail() {
  const tool = useAppStore((s) => s.tool);
  const setTool = useAppStore((s) => s.setTool);
  const setLibraryTab = useAppStore((s) => s.setLibraryTab);
  const leftPanelOpen = useAppStore((s) => s.leftPanelOpen);
  const setLeftPanelOpen = useAppStore((s) => s.setLeftPanelOpen);
  const favoritesDockOpen = useAppStore((s) => s.favoritesDockOpen);
  const setFavoritesDockOpen = useAppStore((s) => s.setFavoritesDockOpen);
  const favoritesCount = useAppStore((s) => s.favorites.length);

  const [order, setOrder] = useState<RailToolId[]>(() => loadRailOrder());
  const [hidden, setHidden] = useState<RailToolId[]>(() => loadRailHidden());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const [dragId, setDragId] = useState<RailToolId | null>(null);
  const [overId, setOverId] = useState<RailToolId | null>(null);

  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => getVisibleRailItems(order, hidden), [order, hidden]);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    setDragId(null);
    setOverId(null);
  }, []);

  /** Position the floating panel next to the gear (portal → body escapes rail stacking). */
  const updatePanelPos = useCallback(() => {
    const btn = settingsBtnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const panelW = Math.min(300, window.innerWidth - 24);
    const panelH = Math.min(window.innerHeight * 0.7, 480);
    let left = r.right + 8;
    let top = r.bottom - panelH;
    if (left + panelW > window.innerWidth - 8) left = Math.max(8, r.left - panelW - 8);
    if (top < 8) top = 8;
    if (top + panelH > window.innerHeight - 8) top = Math.max(8, window.innerHeight - panelH - 8);
    setPanelPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!settingsOpen) {
      setPanelPos(null);
      return;
    }
    updatePanelPos();
    window.addEventListener('resize', updatePanelPos);
    window.addEventListener('scroll', updatePanelPos, true);
    return () => {
      window.removeEventListener('resize', updatePanelPos);
      window.removeEventListener('scroll', updatePanelPos, true);
    };
  }, [settingsOpen, updatePanelPos]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSettings();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('ba-popover-blocking');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('ba-popover-blocking');
    };
  }, [settingsOpen, closeSettings]);

  const onToolClick = (id: ToolId) => {
    if (!leftPanelOpen) setLeftPanelOpen(true);

    if (id === 'library' || id === 'uploads') {
      setTool('library');
      setLibraryTab('uploads');
      return;
    }

    // Toggle: second click on same tool returns to My Library
    if (tool === id) {
      setTool('library');
      setLibraryTab('uploads');
      return;
    }
    setTool(id);
  };

  const isActive = (id: RailToolId) => {
    if (id === 'library') return tool === 'library' || tool === 'uploads';
    return tool === id;
  };

  const toggleHidden = useCallback((id: RailToolId) => {
    if (id === 'library') return;
    setHidden((prev) => {
      const next = prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id];
      saveRailHidden(next);
      return next;
    });
  }, []);

  const moveItem = useCallback((id: RailToolId, dir: -1 | 1) => {
    setOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      saveRailOrder(next);
      return next;
    });
  }, []);

  const reorderByDrag = useCallback((fromId: RailToolId, toId: RailToolId) => {
    if (fromId === toId) return;
    setOrder((prev) => {
      const from = prev.indexOf(fromId);
      const to = prev.indexOf(toId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, fromId);
      saveRailOrder(next);
      return next;
    });
  }, []);

  const resetRail = useCallback(() => {
    const def = DEFAULT_RAIL_ITEMS.map((i) => i.id);
    setOrder(def);
    setHidden([]);
    saveRailOrder(def);
    saveRailHidden([]);
  }, []);

  const settingsPortal =
    settingsOpen &&
    panelPos &&
    createPortal(
      <>
        {/* Blocks canvas, panel resizer, and everything else until closed */}
        <div
          className="ba-popover-scrim"
          aria-hidden
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closeSettings();
          }}
        />
        <div
          ref={settingsPanelRef}
          className="ba-rail-settings"
          role="dialog"
          aria-label="Customize left menu"
          style={{ top: panelPos.top, left: panelPos.left }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="ba-rail-settings-head">
            <strong>Menu items</strong>
            <button type="button" className="ba-btn ba-btn-sm" onClick={resetRail}>
              Reset
            </button>
          </div>
          <p className="ba-rail-settings-hint">
            Drag rows to reorder, or use the arrows. Show/hide with the eye. My Library stays
            visible.
          </p>
          <ul className="ba-rail-settings-list">
            {order.map((id, index) => {
              const def = itemDef(id);
              const isHidden = hidden.includes(id);
              const locked = id === 'library';
              const isDragging = dragId === id;
              const isOver = overId === id && dragId !== id;
              return (
                <li
                  key={id}
                  className={[
                    'ba-rail-settings-row',
                    isHidden ? 'is-hidden' : '',
                    isDragging ? 'is-dragging' : '',
                    isOver ? 'is-drag-over' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (overId !== id) setOverId(id);
                  }}
                  onDragLeave={() => {
                    if (overId === id) setOverId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from =
                      (e.dataTransfer.getData('text/plain') as RailToolId) || dragId;
                    if (from) reorderByDrag(from, id);
                    setDragId(null);
                    setOverId(null);
                  }}
                >
                  <span
                    className="ba-rail-settings-grip"
                    draggable
                    title="Drag to reorder"
                    aria-label={`Drag to reorder ${def.label}`}
                    onDragStart={(e) => {
                      setDragId(id);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', id);
                      const row = (e.currentTarget as HTMLElement).closest(
                        '.ba-rail-settings-row',
                      ) as HTMLElement | null;
                      if (row) e.dataTransfer.setDragImage(row, 20, 16);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                  >
                    <GripVertical size={14} />
                  </span>
                  <span className="ba-rail-settings-icon">{RAIL_ICONS[id]}</span>
                  <span className="ba-rail-settings-label">{def.label}</span>
                  <div className="ba-rail-settings-actions">
                    <button
                      type="button"
                      className="ba-rail-settings-icon-btn"
                      disabled={index === 0}
                      title="Move up"
                      onClick={() => moveItem(id, -1)}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="ba-rail-settings-icon-btn"
                      disabled={index === order.length - 1}
                      title="Move down"
                      onClick={() => moveItem(id, 1)}
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="ba-rail-settings-icon-btn"
                      disabled={locked}
                      title={
                        locked
                          ? 'My Library can’t be hidden'
                          : isHidden
                            ? 'Show in menu'
                            : 'Hide from menu'
                      }
                      onClick={() => toggleHidden(id)}
                    >
                      {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </>,
      document.body,
    );

  return (
    <nav className="ba-rail" aria-label="Drawing tools">
      <div className="ba-rail-tools">
        {visible.map((t) => {
          const active = isActive(t.id);
          return (
            <button
              key={t.id}
              type="button"
              className={`ba-rail-btn ${active ? 'active' : ''} ${
                t.id === 'library' ? 'ba-rail-btn-assets' : ''
              }`}
              onClick={() => onToolClick(t.id)}
              aria-label={t.label}
              aria-pressed={active}
            >
              {RAIL_ICONS[t.id]}
              <span className="tip">{t.tip}</span>
            </button>
          );
        })}
      </div>

      <div className="ba-rail-divider" role="separator" aria-hidden />

      <div className="ba-rail-footer">
        <button
          ref={settingsBtnRef}
          type="button"
          className={`ba-rail-btn ba-rail-settings-btn ${settingsOpen ? 'active' : ''}`}
          onClick={() => setSettingsOpen((o) => !o)}
          aria-label="Menu settings"
          aria-expanded={settingsOpen}
          aria-haspopup="dialog"
        >
          <Settings2 size={18} strokeWidth={1.75} />
          <span className="tip">Menu settings</span>
        </button>
      </div>

      {settingsPortal}

      {!favoritesDockOpen && (
        <button
          type="button"
          className="ba-rail-fav-show"
          title="Show favorites dock"
          onClick={() => setFavoritesDockOpen(true)}
        >
          <Star size={14} fill="currentColor" />
          <span className="ba-rail-fav-show-arrow">
            <ChevronRight size={12} strokeWidth={2.5} />
            Show
          </span>
          {favoritesCount > 0 && (
            <span className="ba-rail-fav-count">{favoritesCount}</span>
          )}
          <span className="tip">Show favorites</span>
        </button>
      )}
    </nav>
  );
}
