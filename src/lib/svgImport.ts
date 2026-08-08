import type { LibraryIcon } from '../data/catalog';

export async function readSvgFiles(
  files: FileList | File[],
  opts?: { folder?: string; source?: LibraryIcon['source'] },
): Promise<LibraryIcon[]> {
  const list = Array.from(files).filter(
    (f) =>
      f.type === 'image/svg+xml' ||
      f.name.toLowerCase().endsWith('.svg'),
  );

  const folder = opts?.folder?.trim() || undefined;
  const source = opts?.source ?? 'user';
  const icons: LibraryIcon[] = [];
  for (const file of list) {
    const text = await file.text();
    if (!text.includes('<svg')) {
      continue;
    }
    const base = file.name.replace(/\.svg$/i, '');
    // Prefer top-level directory from bulk folder pick when no explicit folder
    const rel =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
    const autoFolder =
      folder ||
      (rel.includes('/') ? rel.split('/')[0] : undefined);
    icons.push({
      id: `user/${base}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: base,
      category: 'symbols',
      path: '',
      svgContent: text,
      source,
      folder: autoFolder,
    });
  }
  return icons;
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Ensure SVG is a complete document safe for <img src="data:...">.
 * Fabric toSVG() fragments often omit xmlns and break as image sources.
 */
export function ensureValidSvgDocument(svg: string, fallbackW = 100, fallbackH = 100): string {
  let s = (svg || '').trim();
  if (!s) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fallbackW} ${fallbackH}" width="${fallbackW}" height="${fallbackH}"></svg>`;
  }
  // Strip XML declaration / BOM that can break data URLs in some browsers
  s = s.replace(/^\uFEFF/, '').replace(/^<\?xml[^>]*>\s*/i, '');
  if (!/^\s*<svg\b/i.test(s)) {
    s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fallbackW} ${fallbackH}" width="${fallbackW}" height="${fallbackH}">${s}</svg>`;
  }
  if (!/\sxmlns\s*=/.test(s.match(/<svg\b[^>]*>/i)?.[0] || '')) {
    s = s.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  // xlink for older fabric image embeds
  if (/\sxlink:/.test(s) && !/\sxmlns:xlink\s*=/.test(s.match(/<svg\b[^>]*>/i)?.[0] || '')) {
    s = s.replace(/<svg\b/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  }
  return s;
}

/**
 * Normalize wide/tall MCP scenes so library thumbs stay the same size as builtin icons.
 * Keeps viewBox for correct aspect ratio; forces scalable width/height.
 */
export function normalizeSvgForThumb(svg: string): string {
  let s = ensureValidSvgDocument(svg);
  // Ensure root svg can scale into a fixed thumb box
  s = s.replace(/<svg\b([^>]*)>/i, (_m, attrs: string) => {
    let a = attrs
      .replace(/\swidth\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\sheight\s*=\s*["'][^"']*["']/gi, '');
    // Prefer explicit 100% so <img> box controls size
    if (!/\bviewBox\s*=/i.test(a)) {
      a += ' viewBox="0 0 80 80"';
    }
    if (!/\sxmlns\s*=/.test(a)) {
      a = ` xmlns="http://www.w3.org/2000/svg"${a}`;
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

/**
 * Best-effort thumbnail URL for a library / favorite icon.
 * Prefers PNG data URLs (reliable), then sanitized SVG data URLs, then path.
 */
export function resolveIconThumbSrc(icon: {
  path?: string;
  svgContent?: string;
}): string {
  const path = icon.path || '';
  if (
    path.startsWith('data:image/png') ||
    path.startsWith('data:image/jpeg') ||
    path.startsWith('data:image/webp') ||
    path.startsWith('data:image/gif')
  ) {
    return path;
  }
  if (icon.svgContent && icon.svgContent.includes('<')) {
    try {
      return svgToThumbDataUrl(icon.svgContent);
    } catch {
      /* fall through */
    }
  }
  if (path.startsWith('data:image/svg') || path.includes('svg+xml')) {
    // Re-encode if raw fragment stored after comma
    try {
      const raw = path.includes(',') ? path.slice(path.indexOf(',') + 1) : path;
      let svg = raw;
      try {
        svg = decodeURIComponent(raw);
      } catch {
        /* keep */
      }
      if (svg.includes('<svg')) return svgToThumbDataUrl(svg);
    } catch {
      /* fall through */
    }
    return path;
  }
  if (path && !path.startsWith('data:')) {
    // Built-in / CDN path
    return path;
  }
  if (path.startsWith('data:')) return path;
  return '';
}
