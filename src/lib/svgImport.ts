import type { LibraryIcon } from '../data/catalog';

export async function readSvgFiles(files: FileList | File[]): Promise<LibraryIcon[]> {
  const list = Array.from(files).filter(
    (f) =>
      f.type === 'image/svg+xml' ||
      f.name.toLowerCase().endsWith('.svg'),
  );

  const icons: LibraryIcon[] = [];
  for (const file of list) {
    const text = await file.text();
    if (!text.includes('<svg')) {
      continue;
    }
    const base = file.name.replace(/\.svg$/i, '');
    icons.push({
      id: `user/${base}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: base,
      category: 'symbols',
      path: '',
      svgContent: text,
      source: 'user',
    });
  }
  return icons;
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Normalize wide/tall MCP scenes so library thumbs stay the same size as builtin icons.
 * Keeps viewBox for correct aspect ratio; forces scalable width/height.
 */
export function normalizeSvgForThumb(svg: string): string {
  let s = svg.trim();
  // Ensure root svg can scale into a fixed thumb box
  s = s.replace(/<svg\b([^>]*)>/i, (_m, attrs: string) => {
    let a = attrs
      .replace(/\swidth\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\sheight\s*=\s*["'][^"']*["']/gi, '');
    // Prefer explicit 100% so <img> box controls size
    if (!/\bviewBox\s*=/i.test(a)) {
      a += ' viewBox="0 0 80 80"';
    }
    a += ' width="100%" height="100%" preserveAspectRatio="xMidYMid meet"';
    return `<svg${a}>`;
  });
  return s;
}

/** Data URL for compact library thumbnails (same visual size as built-ins). */
export function svgToThumbDataUrl(svg: string): string {
  return svgToDataUrl(normalizeSvgForThumb(svg));
}
