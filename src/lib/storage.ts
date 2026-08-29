import type { LibraryIcon } from '../data/catalog';
import type { UserTemplate } from '../types';
import type { PackManifest, PackId } from './packs';

const FAVORITES_KEY = 'bioartist-favorites';
const FAVORITES_DOCK_OPEN_KEY = 'bioartist-favorites-dock-open';
const GLASS_OPACITY_KEY = 'bioartist-glass-opacity-v7';
const GLASS_HUE_KEY = 'bioartist-glass-hue-v7';
const THEME_MODE_KEY = 'bioartist-theme-mode-v7';
const LEFT_PANEL_WIDTH_KEY = 'bioartist-left-panel-width-v1';
const LEFT_PANEL_OPEN_KEY = 'bioartist-left-panel-open-v1';
const RIGHT_PANEL_OPEN_KEY = 'bioartist-right-panel-open-v1';

const DB_NAME = 'bioartist';
const DB_VERSION = 4;
const LIB_STORE = 'userLibrary';
const DRAFT_STORE = 'drafts';
const PACK_STORE = 'packs';
const TEMPLATE_STORE = 'userTemplates';
/** FileSystemFileHandle per open document id (same-file autosave). */
const HANDLE_STORE = 'projectHandles';
const PINNED_KEY = 'bioartist-pinned-templates';
const PINNED_ICONS_KEY = 'bioartist-pinned-icons';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LIB_STORE)) {
        db.createObjectStore(LIB_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE);
      }
      if (!db.objectStoreNames.contains(PACK_STORE)) {
        db.createObjectStore(PACK_STORE, { keyPath: 'pack' });
      }
      if (!db.objectStoreNames.contains(TEMPLATE_STORE)) {
        db.createObjectStore(TEMPLATE_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbLoadLibrary(): Promise<LibraryIcon[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(LIB_STORE, 'readonly');
      const store = tx.objectStore(LIB_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as LibraryIcon[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem('bioartist-user-library');
      return raw ? (JSON.parse(raw) as LibraryIcon[]) : [];
    } catch {
      return [];
    }
  }
}

export async function idbSaveLibrary(items: LibraryIcon[]): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LIB_STORE, 'readwrite');
      const store = tx.objectStore(LIB_STORE);
      store.clear();
      for (const item of items) store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    try {
      localStorage.setItem('bioartist-user-library', JSON.stringify(items));
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    try {
      localStorage.setItem('bioartist-user-library', JSON.stringify(items));
      return true;
    } catch {
      return false;
    }
  }
}

export async function idbSaveDraft(payload: unknown): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE, 'readwrite');
      tx.objectStore(DRAFT_STORE).put(payload, 'latest');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    try {
      localStorage.setItem('bioartist-draft', JSON.stringify(payload));
    } catch {
      /* ok */
    }
    return true;
  } catch {
    try {
      localStorage.setItem('bioartist-draft', JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }
}

export async function idbLoadDraft<T>(): Promise<T | null> {
  try {
    const db = await openDb();
    const val = await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE, 'readonly');
      const req = tx.objectStore(DRAFT_STORE).get('latest');
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
    if (val) return val;
  } catch {
    /* fall through */
  }
  try {
    const raw = localStorage.getItem('bioartist-draft');
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function idbSaveFileHandle(
  docId: string,
  handle: FileSystemFileHandle,
): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).put(handle, docId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch (e) {
    console.warn('idbSaveFileHandle', e);
    return false;
  }
}

export async function idbLoadFileHandle(
  docId: string,
): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readonly');
      const req = tx.objectStore(HANDLE_STORE).get(docId);
      req.onsuccess = () => resolve((req.result as FileSystemFileHandle) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function idbDeleteFileHandle(docId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).delete(docId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function idbSavePack(manifest: PackManifest): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PACK_STORE, 'readwrite');
      tx.objectStore(PACK_STORE).put(manifest);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch (e) {
    console.error(e);
    try {
      localStorage.setItem(`bioartist-pack-${manifest.pack}`, JSON.stringify(manifest));
      return true;
    } catch {
      return false;
    }
  }
}

export async function idbLoadPack(pack: PackId): Promise<PackManifest | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PACK_STORE, 'readonly');
      const req = tx.objectStore(PACK_STORE).get(pack);
      req.onsuccess = () => resolve((req.result as PackManifest) || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem(`bioartist-pack-${pack}`);
      return raw ? (JSON.parse(raw) as PackManifest) : null;
    } catch {
      return null;
    }
  }
}

export async function idbDeletePack(pack: PackId): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PACK_STORE, 'readwrite');
      tx.objectStore(PACK_STORE).delete(pack);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(`bioartist-pack-${pack}`);
  } catch {
    /* ignore */
  }
}

export async function idbLoadTemplates(): Promise<UserTemplate[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(TEMPLATE_STORE, 'readonly');
      const req = tx.objectStore(TEMPLATE_STORE).getAll();
      req.onsuccess = () => resolve((req.result as UserTemplate[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem('bioartist-user-templates');
      return raw ? (JSON.parse(raw) as UserTemplate[]) : [];
    } catch {
      return [];
    }
  }
}

export async function idbSaveTemplates(items: UserTemplate[]): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TEMPLATE_STORE, 'readwrite');
      const store = tx.objectStore(TEMPLATE_STORE);
      store.clear();
      for (const item of items) store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    try {
      localStorage.setItem('bioartist-user-templates', JSON.stringify(items));
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    try {
      localStorage.setItem('bioartist-user-templates', JSON.stringify(items));
      return true;
    } catch {
      return false;
    }
  }
}

export function loadPinnedTemplateIds(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function savePinnedTemplateIds(ids: string[]): void {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function loadPinnedIconIds(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_ICONS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function savePinnedIconIds(ids: string[]): void {
  try {
    localStorage.setItem(PINNED_ICONS_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function loadFavorites(): LibraryIcon[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? (arr as LibraryIcon[]) : [];
  } catch {
    return [];
  }
}

export function saveFavorites(items: LibraryIcon[]): boolean {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function loadFavoritesDockOpen(): boolean {
  try {
    const raw = localStorage.getItem(FAVORITES_DOCK_OPEN_KEY);
    if (raw === null) return true;
    return raw !== '0' && raw !== 'false';
  } catch {
    return true;
  }
}

export function saveFavoritesDockOpen(open: boolean): void {
  try {
    localStorage.setItem(FAVORITES_DOCK_OPEN_KEY, open ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function loadGlassOpacity(): number {
  try {
    const n = Number(localStorage.getItem(GLASS_OPACITY_KEY));
    // Range: 0 → 0.5 (0–50% glass frost / pane opacity)
    if (!Number.isFinite(n)) return 0.22;
    return Math.min(0.5, Math.max(0, n));
  } catch {
    return 0.22;
  }
}

export function saveGlassOpacity(v: number): void {
  try {
    localStorage.setItem(GLASS_OPACITY_KEY, String(Math.min(0.5, Math.max(0, v))));
  } catch {
    /* ignore */
  }
}

export function loadGlassHue(): number {
  try {
    const n = Number(localStorage.getItem(GLASS_HUE_KEY));
    if (!Number.isFinite(n)) return 220;
    return ((Math.round(n) % 360) + 360) % 360;
  } catch {
    return 220;
  }
}

export function saveGlassHue(v: number): void {
  try {
    localStorage.setItem(GLASS_HUE_KEY, String(v));
  } catch {
    /* ignore */
  }
}

export type StoredThemeMode = 'dark' | 'light';

export function loadThemeMode(): StoredThemeMode {
  try {
    const v = localStorage.getItem(THEME_MODE_KEY);
    if (v === 'light' || v === 'dark') return v;
    return 'dark';
  } catch {
    return 'dark';
  }
}

export function saveThemeMode(mode: StoredThemeMode): void {
  try {
    localStorage.setItem(THEME_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function loadLeftPanelWidth(): number {
  try {
    const n = Number(localStorage.getItem(LEFT_PANEL_WIDTH_KEY));
    if (!Number.isFinite(n)) return 280;
    return Math.min(520, Math.max(180, Math.round(n)));
  } catch {
    return 280;
  }
}

export function saveLeftPanelWidth(w: number): void {
  try {
    localStorage.setItem(LEFT_PANEL_WIDTH_KEY, String(Math.round(w)));
  } catch {
    /* ignore */
  }
}

export function loadLeftPanelOpen(): boolean {
  try {
    const v = localStorage.getItem(LEFT_PANEL_OPEN_KEY);
    if (v === null) return true;
    return v !== '0' && v !== 'false';
  } catch {
    return true;
  }
}

export function saveLeftPanelOpen(open: boolean): void {
  try {
    localStorage.setItem(LEFT_PANEL_OPEN_KEY, open ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function loadRightPanelOpen(): boolean {
  try {
    const v = localStorage.getItem(RIGHT_PANEL_OPEN_KEY);
    if (v === null) return true;
    return v !== '0' && v !== 'false';
  } catch {
    return true;
  }
}

export function saveRightPanelOpen(open: boolean): void {
  try {
    localStorage.setItem(RIGHT_PANEL_OPEN_KEY, open ? '1' : '0');
  } catch {
    /* ignore */
  }
}
