/**
 * Extract image assets from a .zip (browser-side via fflate).
 * Keeps SVG / PNG / JPEG / WebP / GIF; discards everything else.
 */
import { unzipSync } from 'fflate';
import type { LibraryIcon } from '../data/catalog';
import { readSvgFiles } from './svgImport';

const IMAGE_EXT = /\.(svg|png|jpe?g|webp|gif)$/i;

function mimeForName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

function isZipFile(file: File): boolean {
  const n = file.name.toLowerCase();
  return (
    n.endsWith('.zip') ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed'
  );
}

/**
 * Pull image File objects out of one or more zip archives.
 * Folder structure is flattened; basename is kept.
 */
export async function extractImagesFromZips(zips: File[]): Promise<{
  files: File[];
  /** Suggested library folder from first zip’s name */
  suggestedFolder?: string;
  discarded: number;
}> {
  const files: File[] = [];
  let discarded = 0;
  let suggestedFolder: string | undefined;

  for (const zip of zips) {
    if (!suggestedFolder) {
      suggestedFolder = zip.name.replace(/\.zip$/i, '').replace(/[_-]+/g, ' ').trim() || undefined;
    }
    const buf = new Uint8Array(await zip.arrayBuffer());
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(buf);
    } catch (e) {
      console.error(e);
      throw new Error(`Could not open zip “${zip.name}”`);
    }

    for (const [path, data] of Object.entries(entries)) {
      // Skip directories and macOS junk
      if (!data?.length) {
        discarded += 1;
        continue;
      }
      if (path.endsWith('/')) continue;
      const base = path.split('/').pop() || path;
      if (base.startsWith('.') || path.includes('__MACOSX')) {
        discarded += 1;
        continue;
      }
      if (!IMAGE_EXT.test(base)) {
        discarded += 1;
        continue;
      }
      // Copy into a fresh buffer — fflate may share memory
      const copy = new Uint8Array(data.byteLength);
      copy.set(data);
      files.push(new File([copy], base, { type: mimeForName(base) }));
    }
  }

  return { files, suggestedFolder, discarded };
}

export function partitionImportFiles(list: File[]): {
  zips: File[];
  svgs: File[];
  rasters: File[];
  other: File[];
} {
  const zips: File[] = [];
  const svgs: File[] = [];
  const rasters: File[] = [];
  const other: File[] = [];

  for (const f of list) {
    if (isZipFile(f)) {
      zips.push(f);
      continue;
    }
    const lower = f.name.toLowerCase();
    if (f.type === 'image/svg+xml' || lower.endsWith('.svg')) {
      svgs.push(f);
      continue;
    }
    if (
      /\.(png|jpe?g|webp|gif)$/i.test(lower) ||
      (f.type.startsWith('image/') && f.type !== 'image/svg+xml')
    ) {
      rasters.push(f);
      continue;
    }
    other.push(f);
  }

  return { zips, svgs, rasters, other };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/**
 * Convert SVG + raster files into LibraryIcon entries.
 */
export async function filesToLibraryIcons(
  files: File[],
  opts?: { folder?: string },
): Promise<LibraryIcon[]> {
  const { svgs, rasters } = partitionImportFiles(files);
  const folder = opts?.folder?.trim() || undefined;
  const icons: LibraryIcon[] = [];

  if (svgs.length) {
    const svgIcons = await readSvgFiles(svgs, { folder });
    icons.push(...svgIcons.map((i) => ({ ...i, folder: i.folder || folder })));
  }

  for (const file of rasters) {
    const dataUrl = await readFileAsDataUrl(file);
    const rel =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
    const autoFolder =
      folder || (rel.includes('/') ? rel.split('/')[0] : undefined);
    icons.push({
      id: `user/img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name.replace(/\.[^.]+$/, ''),
      category: 'symbols',
      path: dataUrl,
      source: 'user',
      folder: autoFolder,
    });
  }

  return icons;
}
