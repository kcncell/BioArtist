import { create } from 'zustand';
import type { LibraryIcon } from '../data/catalog';
import {
  idbLoadDraft,
  idbLoadLibrary,
  idbLoadTemplates,
  idbSaveDraft,
  idbSaveLibrary,
  idbSaveTemplates,
  loadFavorites,
  loadFavoritesDockOpen,
  loadPinnedIconIds,
  loadPinnedTemplateIds,
  saveFavorites,
  saveFavoritesDockOpen,
  savePinnedIconIds,
  savePinnedTemplateIds,
} from '../lib/storage';
import type {
  AppState,
  LayerInfo,
  LibraryTab,
  SelectionProps,
  ShapeKind,
  ToolId,
  UserTemplate,
} from '../types';

export interface AppActions {
  setTool: (tool: ToolId) => void;
  setLibraryTab: (tab: LibraryTab) => void;
  setProjectName: (name: string) => void;
  setSearch: (search: string) => void;
  setCategory: (category: string) => void;
  addUserIcons: (
    icons: LibraryIcon[],
    opts?: { stayOnTool?: boolean },
  ) => Promise<boolean>;
  removeUserIcon: (id: string) => void;
  addUserTemplate: (template: UserTemplate) => Promise<boolean>;
  removeUserTemplate: (id: string) => void;
  togglePinTemplate: (id: string) => void;
  togglePinIcon: (id: string) => void;
  addFavorite: (icon: LibraryIcon) => boolean;
  removeFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  setFavoritesDockOpen: (open: boolean) => void;
  setLayers: (layers: LayerInfo[]) => void;
  setSelection: (count: number, props: SelectionProps | null, selectedIds?: string[]) => void;
  setZoom: (zoom: number) => void;
  setArtboardSize: (w: number, h: number) => void;
  showToast: (msg: string) => void;
  clearToast: () => void;
  setExportOpen: (open: boolean) => void;
  setHistoryFlags: (canUndo: boolean, canRedo: boolean) => void;
  setShapeKind: (kind: ShapeKind) => void;
  setObjectCount: (n: number) => void;
  setHelpOpen: (open: boolean) => void;
  setShowGrid: (on: boolean) => void;
  setSnapOn: (on: boolean) => void;
  setColumnGuides: (n: number) => void;
  hydrateLibrary: () => Promise<void>;
}

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  tool: 'library',
  libraryTab: 'library',
  projectName: 'Untitled figure',
  search: '',
  category: 'all',
  userLibrary: [],
  userTemplates: [],
  pinnedTemplateIds: [],
  pinnedIconIds: [],
  favorites: [],
  favoritesDockOpen: true,
  layers: [],
  selectionCount: 0,
  selectedIds: [],
  selectionProps: null,
  zoom: 1,
  artboardWidth: 900,
  artboardHeight: 600,
  toast: null,
  exportOpen: false,
  canUndo: false,
  canRedo: false,
  shapeKind: 'rect',
  objectCount: 0,
  helpOpen: false,
  showGrid: true,
  snapOn: true,
  columnGuides: 0,

  setTool: (tool) => {
    if (tool === 'library' || tool === 'uploads') {
      set({ tool, libraryTab: tool === 'uploads' ? 'uploads' : 'library' });
    } else {
      set({ tool });
    }
  },
  setLibraryTab: (libraryTab) => set({ libraryTab, tool: libraryTab }),
  setProjectName: (projectName) => set({ projectName }),
  setSearch: (search) => set({ search }),
  setCategory: (category) => set({ category }),
  addUserIcons: async (icons, opts) => {
    const next = [...icons, ...get().userLibrary];
    const seen = new Set<string>();
    const unique = next.filter((i) => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    });
    const ok = await idbSaveLibrary(unique);
    if (opts?.stayOnTool) {
      set({ userLibrary: unique });
    } else {
      set({ userLibrary: unique, libraryTab: 'uploads', tool: 'uploads' });
    }
    if (!ok) {
      window.setTimeout(() => {
        get().showToast('Storage full — imports may not persist after reload');
      }, 0);
    }
    return ok;
  },
  removeUserIcon: (id) => {
    const unique = get().userLibrary.filter((i) => i.id !== id);
    void idbSaveLibrary(unique);
    const pinned = get().pinnedIconIds.filter((p) => p !== id);
    savePinnedIconIds(pinned);
    set({ userLibrary: unique, pinnedIconIds: pinned });
  },
  addUserTemplate: async (template) => {
    const next = [template, ...get().userTemplates.filter((t) => t.id !== template.id)];
    const ok = await idbSaveTemplates(next);
    set({ userTemplates: next });
    if (!ok) {
      window.setTimeout(() => {
        get().showToast('Storage full — template may not persist after reload');
      }, 0);
    }
    return ok;
  },
  removeUserTemplate: (id) => {
    const unique = get().userTemplates.filter((t) => t.id !== id);
    void idbSaveTemplates(unique);
    const pinned = get().pinnedTemplateIds.filter((p) => p !== id);
    savePinnedTemplateIds(pinned);
    set({ userTemplates: unique, pinnedTemplateIds: pinned });
  },
  togglePinTemplate: (id) => {
    const cur = get().pinnedTemplateIds;
    const next = cur.includes(id) ? cur.filter((p) => p !== id) : [id, ...cur];
    savePinnedTemplateIds(next);
    set({ pinnedTemplateIds: next });
  },
  togglePinIcon: (id) => {
    const cur = get().pinnedIconIds;
    const next = cur.includes(id) ? cur.filter((p) => p !== id) : [id, ...cur];
    savePinnedIconIds(next);
    set({ pinnedIconIds: next });
  },
  addFavorite: (icon) => {
    const cur = get().favorites;
    if (cur.some((f) => f.id === icon.id)) return false;
    // Cap to keep dock usable and storage small
    const next = [
      {
        id: icon.id,
        name: icon.name,
        category: icon.category,
        path: icon.path,
        svgContent: icon.svgContent,
        source: icon.source,
        license: icon.license,
        licenseLabel: icon.licenseLabel,
        author: icon.author,
        pack: icon.pack,
      },
      ...cur,
    ].slice(0, 48);
    const ok = saveFavorites(next);
    set({ favorites: next });
    return ok;
  },
  removeFavorite: (id) => {
    const next = get().favorites.filter((f) => f.id !== id);
    saveFavorites(next);
    set({ favorites: next });
  },
  isFavorite: (id) => get().favorites.some((f) => f.id === id),
  setFavoritesDockOpen: (open) => {
    saveFavoritesDockOpen(open);
    set({ favoritesDockOpen: open });
  },
  setLayers: (layers) => set({ layers }),
  setSelection: (selectionCount, selectionProps, selectedIds = []) =>
    set({ selectionCount, selectionProps, selectedIds }),
  setZoom: (zoom) => set({ zoom }),
  setArtboardSize: (artboardWidth, artboardHeight) =>
    set({ artboardWidth, artboardHeight }),
  showToast: (toast) => {
    set({ toast });
    window.setTimeout(() => {
      if (get().toast === toast) set({ toast: null });
    }, 2600);
  },
  clearToast: () => set({ toast: null }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
  setHistoryFlags: (canUndo, canRedo) => set({ canUndo, canRedo }),
  setShapeKind: (shapeKind) => set({ shapeKind }),
  setObjectCount: (objectCount) => set({ objectCount }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setSnapOn: (snapOn) => set({ snapOn }),
  setColumnGuides: (columnGuides) =>
    set({ columnGuides: Math.max(0, Math.min(12, Math.round(columnGuides))) }),
  hydrateLibrary: async () => {
    const [items, templates, pinned, pinnedIcons, favorites, dockOpen] = await Promise.all([
      idbLoadLibrary(),
      idbLoadTemplates(),
      Promise.resolve(loadPinnedTemplateIds()),
      Promise.resolve(loadPinnedIconIds()),
      Promise.resolve(loadFavorites()),
      Promise.resolve(loadFavoritesDockOpen()),
    ]);
    set({
      userLibrary: items.length ? items : get().userLibrary,
      userTemplates: templates,
      pinnedTemplateIds: pinned,
      pinnedIconIds: pinnedIcons,
      favorites,
      favoritesDockOpen: dockOpen,
    });
  },
}));

export async function saveDraft(payload: unknown) {
  await idbSaveDraft(payload);
}

export async function loadDraft<T>(): Promise<T | null> {
  return idbLoadDraft<T>();
}

export function clearDraft() {
  try {
    localStorage.removeItem('bioartist-draft');
  } catch {
    /* ignore */
  }
}
