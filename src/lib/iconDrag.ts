import type { LibraryIcon } from '../data/catalog';

export const ICON_DRAG_MIME = 'application/bioartist-icon';

/** Payload written when dragging a library / AI icon */
export type IconDragPayload = {
  id: string;
  name: string;
  category?: string;
  path?: string;
  svgContent?: string;
  source?: LibraryIcon['source'];
  license?: string;
  licenseLabel?: string;
  author?: string;
  pack?: string;
};

export function setIconDragData(e: React.DragEvent, icon: LibraryIcon) {
  const payload: IconDragPayload = {
    id: icon.id,
    name: icon.name,
    category: icon.category,
    path: icon.path,
    svgContent: icon.svgContent,
    source: icon.source,
    license: icon.license,
    licenseLabel: icon.licenseLabel,
    author: icon.author,
    pack: icon.pack,
  };
  e.dataTransfer.setData(ICON_DRAG_MIME, JSON.stringify(payload));
  // Fallback for picky browsers
  e.dataTransfer.setData('text/plain', icon.name);
  e.dataTransfer.effectAllowed = 'copy';
}

export function parseIconDragData(dt: DataTransfer): LibraryIcon | null {
  const raw = dt.getData(ICON_DRAG_MIME);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as IconDragPayload;
    if (!p?.id || !p?.name) return null;
    return {
      id: p.id,
      name: p.name,
      category: p.category || 'symbols',
      path: p.path || '',
      svgContent: p.svgContent,
      source: p.source,
      license: p.license,
      licenseLabel: p.licenseLabel,
      author: p.author,
      pack: p.pack,
    };
  } catch {
    return null;
  }
}

export function dragHasIcon(dt: DataTransfer): boolean {
  return Array.from(dt.types || []).includes(ICON_DRAG_MIME);
}
