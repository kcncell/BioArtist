import type { LibraryIcon } from '../data/catalog';
import {
  addImageFromDataUrl,
  addSvgToCanvas,
  fetchSvgText,
  findClearPlacement,
  getArtboardSize,
} from './canvasController';
import { pushRecentIcon } from './railConfig';
import { ensureValidSvgDocument } from './svgImport';

function isRasterDataUrl(path: string | undefined): boolean {
  if (!path) return false;
  if (!path.startsWith('data:image')) return false;
  // svg+xml is vector
  if (path.includes('svg') || path.includes('image/svg')) return false;
  return true;
}

/**
 * Place a library / favorite icon onto the canvas.
 * - With left/top: drop exactly there (drag-and-drop).
 * - Without: near artboard center in a clear gap so items don’t stack.
 */
export async function placeLibraryIcon(
  icon: LibraryIcon,
  opts?: { left?: number; top?: number; maxSize?: number },
): Promise<void> {
  const art = getArtboardSize();
  const hasExplicit =
    typeof opts?.left === 'number' && typeof opts?.top === 'number';
  const pos = hasExplicit
    ? { left: opts!.left!, top: opts!.top! }
    : findClearPlacement({
        size: opts?.maxSize ?? 160,
        prefer: { left: art.width / 2, top: art.height / 2 },
      });

  const remember = () => {
    try {
      pushRecentIcon(icon);
    } catch {
      /* ignore */
    }
  };

  // Raster PNG/JPEG (including favorites thumbnails used as placeable images)
  if (isRasterDataUrl(icon.path)) {
    // If we also have SVG, prefer SVG for crisp re-place
    if (icon.svgContent && icon.svgContent.includes('<svg')) {
      try {
        await addSvgToCanvas(ensureValidSvgDocument(icon.svgContent), {
          left: pos.left,
          top: pos.top,
          name: icon.name,
          maxSize: opts?.maxSize,
        });
        remember();
        return;
      } catch {
        /* fall through to raster */
      }
    }
    await addImageFromDataUrl(icon.path, {
      left: pos.left,
      top: pos.top,
      name: icon.name,
      maxSize: opts?.maxSize ?? 220,
    });
    remember();
    return;
  }

  let svg = icon.svgContent;
  if (!svg && icon.path && !icon.path.startsWith('data:')) {
    svg = await fetchSvgText(icon.path);
  }
  if (!svg && icon.path?.startsWith('data:image/svg')) {
    const raw = icon.path.includes(',') ? icon.path.split(',').slice(1).join(',') : '';
    try {
      svg = decodeURIComponent(raw);
    } catch {
      try {
        svg = atob(raw);
      } catch {
        svg = raw;
      }
    }
  }

  if (svg && svg.includes('<')) {
    await addSvgToCanvas(ensureValidSvgDocument(svg), {
      left: pos.left,
      top: pos.top,
      name: icon.name,
      maxSize: opts?.maxSize,
    });
    remember();
    return;
  }

  // Last resort: try path as image URL
  if (icon.path) {
    await addImageFromDataUrl(icon.path, {
      left: pos.left,
      top: pos.top,
      name: icon.name,
      maxSize: opts?.maxSize ?? 220,
    });
    remember();
    return;
  }

  throw new Error('Could not load icon');
}
