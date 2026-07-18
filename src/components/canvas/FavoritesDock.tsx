import { ChevronLeft, Star } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { LibraryIcon } from '../../data/catalog';
import { dragHasIcon, parseIconDragData, setIconDragData } from '../../lib/iconDrag';
import { placeLibraryIcon } from '../../lib/placeIcon';
import { readSvgFiles, svgToThumbDataUrl } from '../../lib/svgImport';
import { useAppStore } from '../../store/appStore';
import { ContextMenu } from '../ui/ContextMenu';

export function FavoritesDock() {
  const favorites = useAppStore((s) => s.favorites);
  const favoritesDockOpen = useAppStore((s) => s.favoritesDockOpen);
  const setFavoritesDockOpen = useAppStore((s) => s.setFavoritesDockOpen);
  const addFavorite = useAppStore((s) => s.addFavorite);
  const removeFavorite = useAppStore((s) => s.removeFavorite);
  const showToast = useAppStore((s) => s.showToast);
  const [dragOver, setDragOver] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    icon: LibraryIcon;
  } | null>(null);
  const didDragRef = useRef(false);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);

  if (!favoritesDockOpen) return null;

  const place = async (icon: LibraryIcon) => {
    try {
      await placeLibraryIcon(icon);
      showToast(`Placed “${icon.name}”`);
    } catch {
      showToast('Could not place favorite');
    }
  };

  const addFromIcon = (icon: LibraryIcon) => {
    const ok = addFavorite(icon);
    showToast(
      ok ? `Added “${icon.name}” to favorites` : `“${icon.name}” is already in favorites`,
    );
  };

  const onDragOver = (e: React.DragEvent) => {
    const hasIcon = dragHasIcon(e.dataTransfer);
    const hasFiles = e.dataTransfer.types.includes('Files');
    if (!hasIcon && !hasFiles) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    setDragOver(false);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const icon = parseIconDragData(e.dataTransfer);
    if (icon) {
      // Don't re-toast if dragging a favorite onto itself
      if (favorites.some((f) => f.id === icon.id)) return;
      addFromIcon(icon);
      return;
    }

    const files = e.dataTransfer.files;
    if (!files?.length) return;
    const list = Array.from(files);
    const svgs = list.filter(
      (f) => f.type === 'image/svg+xml' || f.name.toLowerCase().endsWith('.svg'),
    );
    const rasters = list.filter(
      (f) =>
        !svgs.includes(f) &&
        (/\.(png|jpe?g|webp|gif)$/i.test(f.name) || f.type.startsWith('image/')),
    );

    let added = 0;
    if (svgs.length) {
      const icons = await readSvgFiles(svgs);
      for (const ic of icons) {
        if (addFavorite(ic)) added += 1;
      }
    }
    for (const file of rasters) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      const ic: LibraryIcon = {
        id: `user/fav-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name.replace(/\.[^.]+$/, ''),
        category: 'symbols',
        path: dataUrl,
        source: 'user',
      };
      if (addFavorite(ic)) added += 1;
    }

    if (added) {
      showToast(`Added ${added} favorite${added > 1 ? 's' : ''}`);
    } else {
      showToast('Nothing new to add (maybe already favorites)');
    }
  };

  return (
    <div
      className={`ba-favorites-dock ${dragOver ? 'drag-over' : ''}`}
      aria-label="Favorite clip arts — drop icons here, drag onto canvas"
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => void onDrop(e)}
    >
      <div className="ba-favorites-label-col">
        <div className="ba-favorites-label" title="Drag icons here · drag favorites onto canvas">
          <Star size={12} fill="currentColor" />
          Favorites
        </div>
        <button
          type="button"
          className="ba-favorites-hide"
          title="Hide favorites dock"
          onClick={() => setFavoritesDockOpen(false)}
        >
          <ChevronLeft size={12} strokeWidth={2.5} />
          Hide
        </button>
      </div>

      {favorites.length === 0 ? (
        <div className="ba-favorites-empty">
          {dragOver ? (
            <strong>Drop to add favorite</strong>
          ) : (
            <>
              Drag icons here · or right-click → <strong>Add to favorites</strong>
            </>
          )}
        </div>
      ) : (
        <div className="ba-favorites-scroll">
          {favorites.map((icon) => (
            <button
              key={icon.id}
              type="button"
              className="ba-fav-thumb"
              draggable
              title={`${icon.name} · click or drag onto canvas · right-click to remove`}
              onDragStart={(e) => {
                didDragRef.current = true;
                setIconDragData(e, icon);
              }}
              onDragEnd={() => {
                // Allow click again after a short beat
                window.setTimeout(() => {
                  didDragRef.current = false;
                }, 50);
              }}
              onClick={() => {
                if (didDragRef.current) return;
                void place(icon);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCtxMenu({ x: e.clientX, y: e.clientY, icon });
              }}
            >
              <span className="ba-fav-thumb-img">
                {icon.svgContent ? (
                  <img src={svgToThumbDataUrl(icon.svgContent)} alt="" draggable={false} />
                ) : icon.path ? (
                  <img src={icon.path} alt="" draggable={false} />
                ) : (
                  <Star size={16} />
                )}
              </span>
              <span className="ba-fav-thumb-name">{icon.name}</span>
            </button>
          ))}
        </div>
      )}

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y}>
          <button
            type="button"
            onClick={() => {
              void place(ctxMenu.icon);
              setCtxMenu(null);
            }}
          >
            Place on canvas
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              removeFavorite(ctxMenu.icon.id);
              showToast(`Removed “${ctxMenu.icon.name}” from favorites`);
              setCtxMenu(null);
            }}
          >
            Remove from favorites
          </button>
        </ContextMenu>
      )}
    </div>
  );
}
