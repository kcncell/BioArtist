/**
 * Shared chemistry library between the figure editor and Chem Studio.
 * Persists saved / imported / recent structures; studio notifies via BroadcastChannel.
 */

import { smilesToSvg, stripOpaqueBackgroundRects } from './rdkit';

export type ChemStyle = '2d' | 'ballstick' | 'cpk' | 'wire';

export type ChemStructure = {
  id: string;
  name: string;
  smiles: string;
  /** Transparent SVG for canvas placement */
  svg: string;
  source: 'studio' | 'import' | 'recent' | 'favorite' | 'amino';
  style: ChemStyle;
  createdAt: number;
  /** Optional Ketcher / molfile payload for re-open in studio */
  molfile?: string;
};

const STORAGE_KEY = 'bioartist-chem-library-v1';
const CHANNEL = 'bioartist-chem';
const MAX_RECENT = 24;
const MAX_SAVED = 80;

export type ChemLibraryMsg =
  | { type: 'library-updated' }
  | { type: 'structure-saved'; id: string }
  | { type: 'send-to-figure'; structure: ChemStructure };

function loadAll(): ChemStructure[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChemStructure[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(list: ChemStructure[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota */
  }
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage({ type: 'library-updated' } satisfies ChemLibraryMsg);
    ch.close();
  } catch {
    /* ignore */
  }
}

export function loadChemLibrary(): ChemStructure[] {
  return loadAll().sort((a, b) => b.createdAt - a.createdAt);
}

export function loadChemBySource(
  source: ChemStructure['source'] | ChemStructure['source'][],
): ChemStructure[] {
  const set = new Set(Array.isArray(source) ? source : [source]);
  return loadChemLibrary().filter((s) => set.has(s.source));
}

export function upsertChemStructure(
  partial: Omit<ChemStructure, 'id' | 'createdAt'> & { id?: string },
): ChemStructure {
  const list = loadAll();
  const id = partial.id || `chem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const next: ChemStructure = {
    id,
    name: partial.name,
    smiles: partial.smiles,
    svg: stripOpaqueBackgroundRects(partial.svg),
    source: partial.source,
    style: partial.style || '2d',
    createdAt: Date.now(),
    molfile: partial.molfile,
  };
  const without = list.filter((s) => s.id !== id);
  // Cap per role
  let merged = [next, ...without];
  const saved = merged.filter((s) => s.source === 'studio' || s.source === 'import');
  const recent = merged.filter((s) => s.source === 'recent');
  const fav = merged.filter((s) => s.source === 'favorite');
  const amino = merged.filter((s) => s.source === 'amino');
  const trimSaved = saved.slice(0, MAX_SAVED);
  const trimRecent = recent.slice(0, MAX_RECENT);
  merged = [...trimSaved, ...trimRecent, ...fav, ...amino];
  // de-dupe by id
  const seen = new Set<string>();
  merged = merged.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  saveAll(merged);
  return next;
}

export function removeChemStructure(id: string) {
  saveAll(loadAll().filter((s) => s.id !== id));
}

export function pushRecentFromSmiles(
  smiles: string,
  name: string,
  svg: string,
): ChemStructure {
  return upsertChemStructure({
    name,
    smiles,
    svg,
    source: 'recent',
    style: '2d',
  });
}

/** Draw SVG for a style (2D ACS via RDKit; other styles approximated for now). */
export async function renderChemStyle(
  smiles: string,
  style: ChemStyle,
  size = { width: 280, height: 220 },
): Promise<string | null> {
  // 2D ACS black bonds; ball/stick & CPK use thicker / more colorful atoms
  if (style === '2d' || style === 'wire') {
    return smilesToSvg(smiles, {
      width: size.width,
      height: size.height,
      acs: style === '2d',
      transparent: true,
      color: '#000000',
    });
  }
  // ballstick / cpk — still 2D RDKit with hetero color emphasis (3D later)
  return smilesToSvg(smiles, {
    width: size.width,
    height: size.height,
    acs: true,
    transparent: true,
    color: style === 'cpk' ? '#222222' : '#111111',
  });
}

export function openChemStudio(opts?: { smiles?: string }) {
  const url = new URL('/chem', window.location.origin);
  if (opts?.smiles) url.searchParams.set('smiles', opts.smiles);
  window.open(url.toString(), 'bioartist-chem-studio');
}

export function subscribeChemLibrary(onChange: () => void): () => void {
  let ch: BroadcastChannel | null = null;
  try {
    ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (ev: MessageEvent<ChemLibraryMsg>) => {
      if (ev.data?.type === 'library-updated' || ev.data?.type === 'structure-saved') {
        onChange();
      }
    };
  } catch {
    /* ignore */
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('storage', onStorage);
    ch?.close();
  };
}

export function notifySendToFigure(structure: ChemStructure) {
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage({ type: 'send-to-figure', structure } satisfies ChemLibraryMsg);
    ch.close();
  } catch {
    /* ignore */
  }
  // Also park for the figure tab if it was closed
  try {
    localStorage.setItem(
      'bioartist-chem-pending-place',
      JSON.stringify(structure),
    );
  } catch {
    /* ignore */
  }
}

export function consumePendingPlace(): ChemStructure | null {
  try {
    const raw = localStorage.getItem('bioartist-chem-pending-place');
    if (!raw) return null;
    localStorage.removeItem('bioartist-chem-pending-place');
    return JSON.parse(raw) as ChemStructure;
  } catch {
    return null;
  }
}

export function subscribeSendToFigure(
  onPlace: (s: ChemStructure) => void,
): () => void {
  let ch: BroadcastChannel | null = null;
  try {
    ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (ev: MessageEvent<ChemLibraryMsg>) => {
      if (ev.data?.type === 'send-to-figure' && ev.data.structure) {
        onPlace(ev.data.structure);
      }
    };
  } catch {
    /* ignore */
  }
  return () => ch?.close();
}
