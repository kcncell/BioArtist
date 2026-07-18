import type { LibraryIcon } from '../data/catalog';
import { idbDeletePack, idbLoadPack, idbSavePack } from './storage';

export type PackId = 'bioicons' | 'nih';

export interface PackIcon extends LibraryIcon {
  license?: string;
  licenseLabel?: string;
  licenseUrl?: string;
  author?: string;
  attributionRequired?: boolean;
  pack?: PackId | string;
  categoryKey?: string;
}

export interface PackManifest {
  version: number;
  pack: PackId;
  title: string;
  homepage: string;
  repository?: string;
  credit: string;
  generatedAt: string;
  counts: {
    total: number;
    byLicense?: Record<string, number>;
    categories?: string[];
    missingOnDisk?: number;
  };
  items: PackIcon[];
  /** Which variant was installed */
  variant?: 'full' | 'cc0' | 'folder';
}

const BIOICONS_FULL = '/packs/bioicons/manifest.json';
const BIOICONS_CC0 = '/packs/bioicons/manifest-cc0.json';

export async function fetchBioiconsManifest(variant: 'full' | 'cc0' = 'full'): Promise<PackManifest> {
  const url = variant === 'cc0' ? BIOICONS_CC0 : BIOICONS_FULL;
  const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Could not load Bioicons pack (${res.status}). Run the build-bioicons-manifest script.`);
  }
  const data = (await res.json()) as PackManifest;
  data.pack = 'bioicons';
  data.variant = variant;
  return data;
}

export async function installBioiconsPack(variant: 'full' | 'cc0' = 'full'): Promise<PackManifest> {
  const manifest = await fetchBioiconsManifest(variant);
  const ok = await idbSavePack(manifest);
  if (!ok) throw new Error('Could not save Bioicons pack to browser storage');
  return manifest;
}

export async function loadInstalledPack(pack: PackId): Promise<PackManifest | null> {
  return idbLoadPack(pack);
}

export async function removeInstalledPack(pack: PackId): Promise<void> {
  await idbDeletePack(pack);
}

/**
 * Import a folder of SVGs (e.g. user-downloaded NIH BioArt) into a local pack.
 */
export async function installFolderAsPack(
  pack: PackId,
  files: FileList | File[],
  meta: { title: string; homepage: string; credit: string },
): Promise<PackManifest> {
  const list = Array.from(files).filter(
    (f) => f.name.toLowerCase().endsWith('.svg') || f.type === 'image/svg+xml',
  );
  if (!list.length) throw new Error('No SVG files found in folder');

  const items: PackIcon[] = [];
  for (const file of list) {
    const text = await file.text();
    if (!text.includes('<svg')) continue;
    const base = file.name.replace(/\.svg$/i, '');
    // relative path from webkitdirectory often includes folders
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const folder = rel.includes('/') ? rel.split('/').slice(0, -1).join(' / ') : 'Imported';
    items.push({
      id: `${pack}/folder/${rel}`,
      name: base.replace(/[_-]+/g, ' '),
      category: folder || 'Imported',
      path: '',
      svgContent: text,
      source: pack === 'nih' ? 'nih' : 'user',
      pack,
      license: pack === 'nih' ? 'check-entry' : 'unknown',
      licenseLabel: pack === 'nih' ? 'See NIH entry' : 'Imported',
      attributionRequired: pack === 'nih',
      author: pack === 'nih' ? 'NIH BioArt Source' : 'Local file',
    });
  }

  if (!items.length) throw new Error('No valid SVG content found');

  const manifest: PackManifest = {
    version: 1,
    pack,
    title: meta.title,
    homepage: meta.homepage,
    credit: meta.credit,
    generatedAt: new Date().toISOString(),
    counts: { total: items.length },
    items,
    variant: 'folder',
  };

  const ok = await idbSavePack(manifest);
  if (!ok) throw new Error('Could not save pack to browser storage (quota?)');
  return manifest;
}

export function packToLibraryIcons(manifest: PackManifest): PackIcon[] {
  return manifest.items.map((i) => ({
    ...i,
    source: (i.source || manifest.pack) as LibraryIcon['source'],
    pack: manifest.pack,
  }));
}

export function uniqueCategories(items: PackIcon[]): string[] {
  return [...new Set(items.map((i) => i.category).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}
