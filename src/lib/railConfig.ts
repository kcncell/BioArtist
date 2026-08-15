/**
 * Left rail menu configuration: order + visibility (user-customizable).
 */
import type { ToolId } from '../types';

const RAIL_ORDER_KEY = 'bioartist-rail-order-v1';
const RAIL_HIDDEN_KEY = 'bioartist-rail-hidden-v1';
const USER_FOLDERS_KEY = 'bioartist-user-folders-v1';
const RECENT_ICONS_KEY = 'bioartist-recent-icons-v1';

/** Tools that appear in the left rail (settings is separate). */
export type RailToolId = Exclude<ToolId, 'uploads'>;

export type RailItemDef = {
  id: RailToolId;
  label: string;
  tip: string;
};

/** Default order — Assets first, then external packs, then tools */
export const DEFAULT_RAIL_ITEMS: RailItemDef[] = [
  { id: 'library', label: 'My Library', tip: 'My Library' },
  { id: 'bioicons', label: 'Bioicons', tip: 'Bioicons pack' },
  { id: 'nih', label: 'NIH', tip: 'NIH BioArt' },
  { id: 'servier', label: 'SMA', tip: 'Servier Medical Art' },
  { id: 'chem', label: 'Chem', tip: 'Chem' },
  { id: 'ai', label: 'AI', tip: 'AI' },
  { id: 'excalidraw', label: 'Excalidraw', tip: 'Excalidraw diagrams' },
  { id: 'templates', label: 'Templates', tip: 'Templates' },
  { id: 'pdb', label: 'PDB', tip: 'PDB' },
  { id: 'shapes', label: 'Shapes', tip: 'Shapes' },
  { id: 'lines', label: 'Lines', tip: 'Lines & arrows' },
  { id: 'text', label: 'Text', tip: 'Text' },
];

const VALID_IDS = new Set(DEFAULT_RAIL_ITEMS.map((i) => i.id));

export function loadRailOrder(): RailToolId[] {
  try {
    const raw = localStorage.getItem(RAIL_ORDER_KEY);
    if (!raw) return DEFAULT_RAIL_ITEMS.map((i) => i.id);
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return DEFAULT_RAIL_ITEMS.map((i) => i.id);
    const order = parsed.filter((id): id is RailToolId => VALID_IDS.has(id as RailToolId));
    // Append any new tools not in saved order
    for (const d of DEFAULT_RAIL_ITEMS) {
      if (!order.includes(d.id)) order.push(d.id);
    }
    return order.length ? order : DEFAULT_RAIL_ITEMS.map((i) => i.id);
  } catch {
    return DEFAULT_RAIL_ITEMS.map((i) => i.id);
  }
}

export function saveRailOrder(order: RailToolId[]) {
  try {
    localStorage.setItem(RAIL_ORDER_KEY, JSON.stringify(order));
  } catch {
    /* ignore */
  }
}

export function loadRailHidden(): RailToolId[] {
  try {
    const raw = localStorage.getItem(RAIL_HIDDEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return [];
    // My Library cannot be hidden
    return parsed.filter(
      (id): id is RailToolId => VALID_IDS.has(id as RailToolId) && id !== 'library',
    );
  } catch {
    return [];
  }
}

export function saveRailHidden(hidden: RailToolId[]) {
  try {
    localStorage.setItem(
      RAIL_HIDDEN_KEY,
      JSON.stringify(hidden.filter((id) => id !== 'library')),
    );
  } catch {
    /* ignore */
  }
}

export function getVisibleRailItems(
  order: RailToolId[],
  hidden: RailToolId[],
): RailItemDef[] {
  const hide = new Set(hidden);
  const byId = new Map(DEFAULT_RAIL_ITEMS.map((i) => [i.id, i]));
  return order
    .filter((id) => !hide.has(id))
    .map((id) => byId.get(id))
    .filter(Boolean) as RailItemDef[];
}

// ── User library folders ──────────────────────────────────────────────────

export function loadUserFolders(): string[] {
  try {
    const raw = localStorage.getItem(USER_FOLDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string' && s.trim()) : [];
  } catch {
    return [];
  }
}

export function saveUserFolders(folders: string[]) {
  try {
    localStorage.setItem(USER_FOLDERS_KEY, JSON.stringify(folders));
  } catch {
    /* ignore */
  }
}

// ── Recently used icons (placed on canvas) ────────────────────────────────

export type RecentIconEntry = {
  id: string;
  name: string;
  category: string;
  path: string;
  svgContent?: string;
  source?: string;
  folder?: string;
  usedAt: string;
};

export function loadRecentIcons(): RecentIconEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_ICONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentIconEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, 48) : [];
  } catch {
    return [];
  }
}

export function pushRecentIcon(icon: {
  id: string;
  name: string;
  category: string;
  path: string;
  svgContent?: string;
  source?: string;
  folder?: string;
}) {
  try {
    const cur = loadRecentIcons().filter((r) => r.id !== icon.id);
    const next: RecentIconEntry[] = [
      {
        id: icon.id,
        name: icon.name,
        category: icon.category,
        path: icon.path,
        svgContent: icon.svgContent,
        source: icon.source,
        folder: icon.folder,
        usedAt: new Date().toISOString(),
      },
      ...cur,
    ].slice(0, 48);
    localStorage.setItem(RECENT_ICONS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
