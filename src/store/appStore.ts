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
  loadGlassHue,
  loadGlassOpacity,
  loadLeftPanelOpen,
  loadLeftPanelWidth,
  loadPinnedIconIds,
  loadPinnedTemplateIds,
  loadRightPanelOpen,
  loadThemeMode,
  saveFavorites,
  saveFavoritesDockOpen,
  saveGlassHue,
  saveGlassOpacity,
  saveLeftPanelOpen,
  saveLeftPanelWidth,
  savePinnedIconIds,
  savePinnedTemplateIds,
  saveRightPanelOpen,
  saveThemeMode,
} from '../lib/storage';
import { applyGlassTheme } from '../lib/glassTheme';
import type {
  AppState,
  LayerInfo,
  LibraryTab,
  OpenDocument,
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
  /** Replace full user library (persist). */
  setUserLibrary: (icons: LibraryIcon[]) => Promise<boolean>;
  /** Move one icon into a My Library category (folder field). Empty = uncategorized. */
  setUserIconCategory: (id: string, category: string | null) => Promise<boolean>;
  /** Rename a My Library category across all icons. */
  renameUserCategory: (from: string, to: string) => Promise<boolean>;
  /** Remove category tag from all icons in it (icons stay in library). */
  clearUserCategory: (category: string) => Promise<boolean>;
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
  setRowGuides: (n: number) => void;
  setGlassOpacity: (n: number) => void;
  setGlassHue: (n: number) => void;
  setThemeMode: (mode: 'dark' | 'light') => void;
  setLeftPanelWidth: (w: number) => void;
  setLeftPanelOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setOpenDocuments: (docs: OpenDocument[]) => void;
  setActiveDocumentId: (id: string) => void;
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
  columnGuides: 1,
  rowGuides: 1,
  glassOpacity: typeof window !== 'undefined' ? loadGlassOpacity() : 0.22,
  glassHue: typeof window !== 'undefined' ? loadGlassHue() : 220,
  themeMode: typeof window !== 'undefined' ? loadThemeMode() : 'dark',
  leftPanelWidth: typeof window !== 'undefined' ? loadLeftPanelWidth() : 280,
  leftPanelOpen: typeof window !== 'undefined' ? loadLeftPanelOpen() : true,
  rightPanelOpen: typeof window !== 'undefined' ? loadRightPanelOpen() : true,
  openDocuments: [
    {
      id: 'doc_initial',
      name: 'Untitled figure',
      artboardWidth: 900,
      artboardHeight: 600,
      snapshot: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  activeDocumentId: 'doc_initial',

  setTool: (tool) => {
    // Drop any in-progress “draw text box” when leaving/changing tools
    void import('../lib/canvasController').then((m) => {
      if (m.isTextBoxDrawActive?.()) m.cancelTextBoxDraw();
    });
    // Opening a rail tool also reveals the left panel if it was hidden
    if (!get().leftPanelOpen) {
      saveLeftPanelOpen(true);
    }
    if (tool === 'library' || tool === 'uploads') {
      // Both map to My Library in the left panel
      set({
        tool: 'library',
        libraryTab: 'uploads',
        leftPanelOpen: true,
      });
    } else {
      set({ tool, leftPanelOpen: true });
    }
  },
  setLibraryTab: (libraryTab) => {
    if (!get().leftPanelOpen) saveLeftPanelOpen(true);
    set({ libraryTab, tool: libraryTab, leftPanelOpen: true });
  },
  setProjectName: (projectName) => {
    const id = get().activeDocumentId;
    const openDocuments = get().openDocuments.map((d) =>
      d.id === id ? { ...d, name: projectName, updatedAt: new Date().toISOString() } : d,
    );
    set({ projectName, openDocuments });
  },
  setSearch: (search) => set({ search }),
  setCategory: (category) => set({ category }),
  addUserIcons: async (icons, opts) => {
    // Soft-dedupe by category + name so re-importing the same zip merges
    // into existing entries (keeps prior id for favorites stability).
    const keyOf = (i: LibraryIcon) => {
      const cat = (i.folder || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const name = i.name.trim().toLowerCase();
      return `${cat}::${name}`;
    };
    const next = [...get().userLibrary];
    for (const icon of icons) {
      const k = keyOf(icon);
      const idx = next.findIndex((i) => keyOf(i) === k);
      if (idx >= 0) {
        const prev = next[idx];
        next[idx] = {
          ...icon,
          id: prev.id,
          folder: icon.folder ?? prev.folder,
        };
      } else {
        next.unshift(icon);
      }
    }
    const ok = await idbSaveLibrary(next);
    if (opts?.stayOnTool) {
      set({ userLibrary: next });
    } else {
      // Imports land in My Library (rail tool "library")
      set({ userLibrary: next, libraryTab: 'uploads', tool: 'library' });
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
  setUserLibrary: async (icons) => {
    const ok = await idbSaveLibrary(icons);
    set({ userLibrary: icons });
    return ok;
  },
  setUserIconCategory: async (id, category) => {
    const cat = category?.trim() || undefined;
    const unique = get().userLibrary.map((i) =>
      i.id === id ? { ...i, folder: cat } : i,
    );
    const ok = await idbSaveLibrary(unique);
    set({ userLibrary: unique });
    return ok;
  },
  renameUserCategory: async (from, to) => {
    const fromKey = from.trim().toLowerCase().replace(/\s+/g, ' ');
    const toName = to.trim().replace(/\s+/g, ' ');
    if (!fromKey || !toName) return false;
    const unique = get().userLibrary.map((i) => {
      const f = (i.folder || '').trim().toLowerCase().replace(/\s+/g, ' ');
      return f === fromKey ? { ...i, folder: toName } : i;
    });
    const ok = await idbSaveLibrary(unique);
    set({ userLibrary: unique });
    return ok;
  },
  clearUserCategory: async (category) => {
    const key = category.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key) return false;
    const unique = get().userLibrary.map((i) => {
      const f = (i.folder || '').trim().toLowerCase().replace(/\s+/g, ' ');
      return f === key ? { ...i, folder: undefined } : i;
    });
    const ok = await idbSaveLibrary(unique);
    set({ userLibrary: unique });
    return ok;
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
    set({ columnGuides: Math.max(1, Math.min(24, Math.round(columnGuides) || 1)) }),
  setRowGuides: (rowGuides) =>
    set({ rowGuides: Math.max(1, Math.min(24, Math.round(rowGuides) || 1)) }),
  setGlassOpacity: (n) => {
    const glassOpacity = Math.min(1, Math.max(0, n));
    saveGlassOpacity(glassOpacity);
    const { glassHue, themeMode } = get();
    applyGlassTheme(glassOpacity, glassHue, themeMode);
    set({ glassOpacity });
  },
  setGlassHue: (n) => {
    const glassHue = ((Math.round(n) % 360) + 360) % 360;
    saveGlassHue(glassHue);
    const { glassOpacity, themeMode } = get();
    applyGlassTheme(glassOpacity, glassHue, themeMode);
    set({ glassHue });
  },
  setThemeMode: (mode) => {
    const themeMode = mode === 'light' ? 'light' : 'dark';
    saveThemeMode(themeMode);
    const { glassOpacity, glassHue } = get();
    applyGlassTheme(glassOpacity, glassHue, themeMode);
    set({ themeMode });
  },
  setLeftPanelWidth: (w) => {
    const leftPanelWidth = Math.min(520, Math.max(180, Math.round(w)));
    saveLeftPanelWidth(leftPanelWidth);
    set({ leftPanelWidth });
  },
  setLeftPanelOpen: (open) => {
    saveLeftPanelOpen(open);
    set({ leftPanelOpen: open });
  },
  setRightPanelOpen: (open) => {
    saveRightPanelOpen(open);
    set({ rightPanelOpen: open });
  },
  toggleLeftPanel: () => {
    const open = !get().leftPanelOpen;
    saveLeftPanelOpen(open);
    set({ leftPanelOpen: open });
  },
  toggleRightPanel: () => {
    const open = !get().rightPanelOpen;
    saveRightPanelOpen(open);
    set({ rightPanelOpen: open });
  },
  setOpenDocuments: (openDocuments) => set({ openDocuments }),
  setActiveDocumentId: (activeDocumentId) => set({ activeDocumentId }),
  hydrateLibrary: async () => {
    const [items, templates, pinned, pinnedIcons, favorites, dockOpen] = await Promise.all([
      idbLoadLibrary(),
      idbLoadTemplates(),
      Promise.resolve(loadPinnedTemplateIds()),
      Promise.resolve(loadPinnedIconIds()),
      Promise.resolve(loadFavorites()),
      Promise.resolve(loadFavoritesDockOpen()),
    ]);
    const glassOpacity = loadGlassOpacity();
    const glassHue = loadGlassHue();
    const themeMode = loadThemeMode();
    applyGlassTheme(glassOpacity, glassHue, themeMode);
    set({
      userLibrary: items.length ? items : get().userLibrary,
      userTemplates: templates,
      pinnedTemplateIds: pinned,
      pinnedIconIds: pinnedIcons,
      favorites,
      favoritesDockOpen: dockOpen,
      glassOpacity,
      glassHue,
      themeMode,
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
