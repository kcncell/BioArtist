import type { LibraryIcon } from '../data/catalog';
import { addImageFromDataUrl, addSvgToCanvas, fetchSvgText } from './canvasController';

/** Place a library / favorite icon onto the canvas. */
export async function placeLibraryIcon(icon: LibraryIcon): Promise<void> {
  if (icon.path?.startsWith('data:image') && !icon.path.includes('svg')) {
    await addImageFromDataUrl(icon.path, { name: icon.name });
    return;
  }
  let svg = icon.svgContent;
  if (!svg && icon.path && !icon.path.startsWith('data:')) {
    svg = await fetchSvgText(icon.path);
  }
  if (!svg && icon.path?.startsWith('data:image/svg')) {
    const raw = icon.path.split(',')[1] || '';
    try {
      svg = decodeURIComponent(raw);
    } catch {
      svg = raw;
    }
  }
  if (!svg) {
    throw new Error('Could not load icon');
  }
  await addSvgToCanvas(svg, { name: icon.name });
}
