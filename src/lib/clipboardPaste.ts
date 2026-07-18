import { addImageFromDataUrl, addSvgToCanvas } from './canvasController';
import type { LibraryIcon } from '../data/catalog';

export interface PasteResult {
  kind: 'svg' | 'image' | 'none';
  name?: string;
  svgContent?: string;
  dataUrl?: string;
}

/** Pull a full <svg>…</svg> block out of plain text or HTML. */
export function extractSvgMarkup(raw: string): string | null {
  if (!raw || !raw.includes('<svg')) return null;
  const match = raw.match(/<svg\b[\s\S]*?<\/svg>/i);
  if (match) return match[0].trim();
  if (/<svg\b/i.test(raw) && /<\/svg>/i.test(raw)) {
    const start = raw.search(/<svg\b/i);
    const end = raw.toLowerCase().lastIndexOf('</svg>');
    if (start >= 0 && end > start) return raw.slice(start, end + 6).trim();
  }
  return null;
}

function guessNameFromSvg(svg: string): string {
  const titled = svg.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titled?.[1]) return titled[1].trim().slice(0, 60);
  const id = svg.match(/\bid=["']([^"']+)["']/i);
  if (id?.[1] && id[1].length > 2) return id[1].replace(/[-_]/g, ' ').slice(0, 60);
  return `Pasted SVG ${new Date().toLocaleTimeString()}`;
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/**
 * Snapshot clipboard payloads synchronously (must run before async gaps —
 * browsers invalidate clipboardData after the paste handler returns).
 */
export function snapshotClipboard(e: ClipboardEvent): {
  plain: string;
  html: string;
  files: File[];
  imageBlobs: { type: string; blob: Blob }[];
  svgBlobs: Blob[];
} {
  const cd = e.clipboardData;
  const plain = cd?.getData('text/plain') || '';
  const html = cd?.getData('text/html') || '';
  const files = cd?.files ? Array.from(cd.files) : [];
  const imageBlobs: { type: string; blob: Blob }[] = [];
  const svgBlobs: Blob[] = [];

  if (cd?.items) {
    for (const item of Array.from(cd.items)) {
      if (item.type === 'image/svg+xml') {
        const f = item.getAsFile();
        if (f) svgBlobs.push(f);
      } else if (item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) imageBlobs.push({ type: item.type, blob: f });
      }
    }
  }

  return { plain, html, files, imageBlobs, svgBlobs };
}

export function clipboardLooksPasteable(snap: ReturnType<typeof snapshotClipboard>): boolean {
  if (snap.files.length || snap.imageBlobs.length || snap.svgBlobs.length) return true;
  if (extractSvgMarkup(snap.plain) || extractSvgMarkup(snap.html)) return true;
  if (/^data:image\//i.test(snap.plain.trim())) return true;
  return false;
}

export async function resolveClipboardSnapshot(
  snap: ReturnType<typeof snapshotClipboard>,
): Promise<PasteResult> {
  // Files (Finder / Explorer copy)
  for (const file of snap.files) {
    if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
      const text = await file.text();
      const svg = extractSvgMarkup(text);
      if (svg) {
        return {
          kind: 'svg',
          name: file.name.replace(/\.svg$/i, '') || guessNameFromSvg(svg),
          svgContent: svg,
        };
      }
    }
    if (file.type.startsWith('image/')) {
      return {
        kind: 'image',
        name: file.name.replace(/\.[^.]+$/, '') || 'Pasted image',
        dataUrl: await fileToDataUrl(file),
      };
    }
  }

  for (const blob of snap.svgBlobs) {
    const text = await blob.text();
    const svg = extractSvgMarkup(text);
    if (svg) return { kind: 'svg', name: guessNameFromSvg(svg), svgContent: svg };
  }

  const fromPlain = extractSvgMarkup(snap.plain);
  if (fromPlain) {
    return { kind: 'svg', name: guessNameFromSvg(fromPlain), svgContent: fromPlain };
  }
  const fromHtml = extractSvgMarkup(snap.html);
  if (fromHtml) {
    return { kind: 'svg', name: guessNameFromSvg(fromHtml), svgContent: fromHtml };
  }

  const dataSvg = snap.plain.trim().match(/^data:image\/svg\+xml[^,]*,([\s\S]+)$/i);
  if (dataSvg) {
    try {
      let decoded = dataSvg[1];
      if (/^charset=/i.test(decoded)) {
        // data:image/svg+xml;charset=utf-8,<svg...
        const comma = snap.plain.indexOf(',');
        decoded = snap.plain.slice(comma + 1);
      }
      decoded = decodeURIComponent(decoded);
      const svg = extractSvgMarkup(decoded) || (decoded.includes('<svg') ? decoded : null);
      if (svg) return { kind: 'svg', name: guessNameFromSvg(svg), svgContent: svg };
    } catch {
      /* ignore */
    }
  }

  for (const { blob } of snap.imageBlobs) {
    return {
      kind: 'image',
      name: 'Pasted image',
      dataUrl: await fileToDataUrl(blob),
    };
  }

  return { kind: 'none' };
}

export async function pasteOntoCanvas(result: PasteResult): Promise<boolean> {
  if (result.kind === 'svg' && result.svgContent) {
    await addSvgToCanvas(result.svgContent, {
      name: result.name || 'Pasted SVG',
    });
    return true;
  }
  if (result.kind === 'image' && result.dataUrl) {
    await addImageFromDataUrl(result.dataUrl, {
      name: result.name || 'Pasted image',
    });
    return true;
  }
  return false;
}

export function pasteResultToLibraryIcon(result: PasteResult): LibraryIcon | null {
  if (result.kind === 'svg' && result.svgContent) {
    const name = result.name || 'Pasted SVG';
    return {
      id: `user/paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      category: 'symbols',
      path: '',
      svgContent: result.svgContent,
      source: 'user',
    };
  }
  if (result.kind === 'image' && result.dataUrl) {
    const name = result.name || 'Pasted image';
    return {
      id: `user/paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      category: 'symbols',
      path: result.dataUrl,
      source: 'user',
    };
  }
  return null;
}
