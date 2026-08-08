/**
 * Shared library UI for My Library, Bioicons, NIH, and SMA.
 * Top: category + import + drop (optional Website). Bottom: category pills + icons.
 */
import {
  Archive,
  ExternalLink,
  FolderOpen,
  Image as ImageIcon,
  MoreVertical,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  isMcpIcon,
  isRemovableLibraryIcon,
  type LibraryIcon,
} from '../../data/catalog';
import {
  categoryKey,
  formatCategoryName,
  resolveCategoryName,
} from '../../lib/libraryCategories';
import { placeLibraryIcon } from '../../lib/placeIcon';
import { setIconDragData } from '../../lib/iconDrag';
import {
  categoriesForScope,
  iconsForScope,
  loadSourceCategories,
  saveSourceCategories,
  type LibrarySourceScope,
} from '../../lib/sourceCategories';
import { svgToThumbDataUrl } from '../../lib/svgImport';
import {
  extractImagesFromZips,
  filesToLibraryIcons,
  partitionImportFiles,
} from '../../lib/zipImport';
import { useAppStore } from '../../store/appStore';
import { PanelSplit } from '../layout/PanelSplit';
import { ContextMenu } from '../ui/ContextMenu';
import {
  EXTERNAL_ART_SOURCES,
  ExternalArtDialog,
  openExternalArtTarget,
  type ExternalArtTarget,
} from './ExternalArtDialog';

type MyLibView = 'all' | `cat:${string}`;

const SCOPE_META: Record<
  LibrarySourceScope,
  {
    title: string;
    websiteKey?: keyof typeof EXTERNAL_ART_SOURCES;
    defaultCategory?: string;
    importSource: LibraryIcon['source'];
  }
> = {
  library: {
    title: 'My Library',
    importSource: 'user',
  },
  bioicons: {
    title: 'Bioicons',
    websiteKey: 'bioicons',
    defaultCategory: 'Bioicons',
    importSource: 'bioicons',
  },
  nih: {
    title: 'NIH BioArt',
    websiteKey: 'nih',
    defaultCategory: 'NIH BioArt',
    importSource: 'nih',
  },
  servier: {
    title: 'Servier Medical Art',
    websiteKey: 'servier',
    defaultCategory: 'Servier Medical Art',
    importSource: 'servier',
  },
};

type Props = {
  scope: LibrarySourceScope;
};

export function SourceLibraryPanel({ scope }: Props) {
  const meta = SCOPE_META[scope];
  const userLibrary = useAppStore((s) => s.userLibrary);
  const search = useAppStore((s) => s.search);
  const setSearch = useAppStore((s) => s.setSearch);
  const addUserIcons = useAppStore((s) => s.addUserIcons);
  const removeUserIcon = useAppStore((s) => s.removeUserIcon);
  const setUserIconCategory = useAppStore((s) => s.setUserIconCategory);
  const setUserLibrary = useAppStore((s) => s.setUserLibrary);
  const addFavorite = useAppStore((s) => s.addFavorite);
  const removeFavorite = useAppStore((s) => s.removeFavorite);
  const favorites = useAppStore((s) => s.favorites);
  const showToast = useAppStore((s) => s.showToast);

  const fileRef = useRef<HTMLInputElement>(null);
  const folderImportRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const catMenuRef = useRef<HTMLDivElement>(null);

  const [dragOver, setDragOver] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [myView, setMyView] = useState<MyLibView>('all');
  const [savedCats, setSavedCats] = useState<string[]>(() => loadSourceCategories(scope));
  const [importCategory, setImportCategory] = useState('');
  const [catMenu, setCatMenu] = useState<{ cat: string; x: number; y: number } | null>(
    null,
  );
  const [renamingCat, setRenamingCat] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [pendingExternal, setPendingExternal] = useState<ExternalArtTarget | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    icon: LibraryIcon;
  } | null>(null);

  // Reset local view when switching rail tools
  useEffect(() => {
    setMyView('all');
    setImportCategory('');
    setSavedCats(loadSourceCategories(scope));
    setSearch('');
  }, [scope, setSearch]);

  const scopeIcons = useMemo(
    () => iconsForScope(userLibrary, scope),
    [userLibrary, scope],
  );

  const libraryCategories = useMemo(
    () => categoriesForScope(userLibrary, scope, savedCats),
    [userLibrary, scope, savedCats],
  );

  const visibleIcons = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchQ = (icon: LibraryIcon) => {
      if (!q) return true;
      return (
        icon.name.toLowerCase().includes(q) ||
        (icon.category || '').toLowerCase().includes(q) ||
        (icon.author || '').toLowerCase().includes(q) ||
        (icon.folder || '').toLowerCase().includes(q)
      );
    };
    if (myView.startsWith('cat:')) {
      const cat = myView.slice(4);
      const key = categoryKey(cat);
      return scopeIcons.filter(
        (icon) => categoryKey(icon.folder || '') === key && matchQ(icon),
      );
    }
    return scopeIcons.filter(matchQ);
  }, [myView, scopeIcons, search]);

  const countInCategory = useCallback(
    (cat: string) => {
      const key = categoryKey(cat);
      return scopeIcons.filter((i) => categoryKey(i.folder || '') === key).length;
    },
    [scopeIcons],
  );

  const rememberCategory = useCallback(
    (name: string): string => {
      const pretty = formatCategoryName(name);
      if (!pretty) return '';
      const known = categoriesForScope(userLibrary, scope, savedCats);
      const resolved = resolveCategoryName(pretty, known) || pretty;
      setSavedCats((prev) => {
        if (prev.some((p) => categoryKey(p) === categoryKey(resolved))) return prev;
        const next = [...prev, resolved].sort((a, b) => a.localeCompare(b));
        saveSourceCategories(scope, next);
        return next;
      });
      return resolved;
    },
    [userLibrary, scope, savedCats],
  );

  const deleteIcon = (icon: LibraryIcon) => {
    if (!isRemovableLibraryIcon(icon)) {
      showToast('This icon can’t be deleted');
      setCtxMenu(null);
      return;
    }
    removeUserIcon(icon.id);
    showToast(`Deleted “${icon.name}”`);
    setCtxMenu(null);
  };

  const moveIconToCategory = async (icon: LibraryIcon, cat: string | null) => {
    const resolved = cat ? rememberCategory(cat) : null;
    await setUserIconCategory(icon.id, resolved || null);
    showToast(
      resolved
        ? `Moved “${icon.name}” → ${resolved}`
        : `“${icon.name}” uncategorized`,
    );
    setCtxMenu(null);
  };

  const commitRenameCategory = async (from: string) => {
    const to = formatCategoryName(renameValue);
    if (!to) {
      showToast('Enter a category name');
      return;
    }
    const existing = resolveCategoryName(to, libraryCategories);
    const finalName = existing || to;
    const ids = new Set(scopeIcons.map((i) => i.id));
    const fromKey = categoryKey(from);
    const nextLib = userLibrary.map((icon) => {
      if (!ids.has(icon.id)) return icon;
      if (categoryKey(icon.folder || '') !== fromKey) return icon;
      return { ...icon, folder: finalName };
    });
    await setUserLibrary(nextLib);
    setSavedCats((prev) => {
      const without = prev.filter((p) => categoryKey(p) !== fromKey);
      const next = without.some((p) => categoryKey(p) === categoryKey(finalName))
        ? without
        : [...without, finalName].sort((a, b) => a.localeCompare(b));
      saveSourceCategories(scope, next);
      return next;
    });
    if (myView === `cat:${from}` || categoryKey(myView.slice(4)) === fromKey) {
      setMyView(`cat:${finalName}`);
    }
    if (categoryKey(importCategory) === fromKey) setImportCategory(finalName);
    showToast(`Category renamed to “${finalName}”`);
    setRenamingCat(null);
    setCatMenu(null);
  };

  const removeCategory = async (cat: string) => {
    const key = categoryKey(cat);
    const ids = new Set(scopeIcons.map((i) => i.id));
    const nextLib = userLibrary.map((icon) => {
      if (!ids.has(icon.id)) return icon;
      if (categoryKey(icon.folder || '') !== key) return icon;
      return { ...icon, folder: undefined };
    });
    await setUserLibrary(nextLib);
    setSavedCats((prev) => {
      const next = prev.filter((p) => categoryKey(p) !== key);
      saveSourceCategories(scope, next);
      return next;
    });
    if (myView.startsWith('cat:') && categoryKey(myView.slice(4)) === key) {
      setMyView('all');
    }
    if (categoryKey(importCategory) === key) setImportCategory('');
    showToast(`Category “${cat}” removed (icons kept)`);
    setCatMenu(null);
  };

  const openCatMenu = (cat: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRenamingCat(null);
    const pad = 8;
    const mw = 168;
    const mh = 160;
    let x = e.clientX;
    let y = e.clientY;
    if (x + mw > window.innerWidth - pad) x = Math.max(pad, window.innerWidth - mw - pad);
    if (y + mh > window.innerHeight - pad) y = Math.max(pad, window.innerHeight - mh - pad);
    setCatMenu({ cat, x, y });
  };

  useEffect(() => {
    if (!catMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (catMenuRef.current && !catMenuRef.current.contains(e.target as Node)) {
        setCatMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCatMenu(null);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [catMenu]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);

  const onImportFiles = async (files: FileList | File[] | null) => {
    if (!files || !files.length || importBusy) return;
    setImportBusy(true);
    try {
      let list = Array.from(files);
      const { zips, svgs, rasters, other } = partitionImportFiles(list);
      let discarded = other.length;
      let zipSuggested: string | undefined;

      if (zips.length) {
        const extracted = await extractImagesFromZips(zips);
        discarded += extracted.discarded;
        zipSuggested = extracted.suggestedFolder;
        list = [...svgs, ...rasters, ...extracted.files];
      } else {
        list = [...svgs, ...rasters];
      }

      const rawHint =
        importCategory.trim() ||
        zipSuggested ||
        (() => {
          const withRel = list.find(
            (f) =>
              (f as File & { webkitRelativePath?: string }).webkitRelativePath?.includes(
                '/',
              ),
          ) as (File & { webkitRelativePath?: string }) | undefined;
          const rel = withRel?.webkitRelativePath || '';
          if (rel.includes('/')) return rel.split('/')[0];
          if (list.length === 1) {
            return list[0].name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
          }
          return meta.defaultCategory;
        })();

      const catHint = resolveCategoryName(rawHint, libraryCategories);

      if (!list.length) {
        showToast(
          discarded
            ? `No SVG or image files found (${discarded} skipped)`
            : 'No SVG or image files found',
        );
        return;
      }

      if (catHint) rememberCategory(catHint);

      const icons = await filesToLibraryIcons(list, { folder: catHint });
      const tagged = icons.map((i) => {
        const folder =
          resolveCategoryName(i.folder || catHint, [
            ...libraryCategories,
            ...(catHint ? [catHint] : []),
          ]) || catHint;
        const base: LibraryIcon = {
          ...i,
          folder,
          source: meta.importSource,
        };
        if (scope === 'servier') {
          base.author = base.author || 'Servier Medical Art (imported)';
          base.licenseLabel = base.licenseLabel || 'CC BY 4.0 — credit required';
          base.attributionRequired = true;
        } else if (scope === 'nih') {
          base.author = base.author || 'NIH BioArt Source';
          base.licenseLabel = base.licenseLabel || 'See NIH entry';
          base.attributionRequired = base.attributionRequired ?? true;
        } else if (scope === 'bioicons') {
          base.author = base.author || 'Bioicons (imported)';
          base.licenseLabel = base.licenseLabel || 'Check icon license';
        }
        return base;
      });

      for (const icon of tagged) {
        if (icon.folder) rememberCategory(icon.folder);
      }

      if (!tagged.length) {
        showToast('No valid icons could be read');
        return;
      }

      const ok = await addUserIcons(tagged, { stayOnTool: scope !== 'library' });
      if (ok) {
        const extra =
          discarded > 0
            ? ` · skipped ${discarded} non-image file${discarded === 1 ? '' : 's'}`
            : '';
        showToast(
          `Imported ${tagged.length} icon${tagged.length === 1 ? '' : 's'}${catHint ? ` → ${catHint}` : ''}${extra}`,
        );
        setMyView(catHint ? `cat:${catHint}` : 'all');
        if (catHint) setImportCategory(catHint);
      }
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImportBusy(false);
    }
  };

  const placeIcon = async (icon: LibraryIcon) => {
    try {
      await placeLibraryIcon(icon);
      if (icon.attributionRequired) {
        showToast(
          `Placed “${icon.name}” · ${icon.licenseLabel || 'attribution may be required'}`,
        );
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to place icon');
    }
  };

  const openWebsite = () => {
    if (!meta.websiteKey) return;
    setPendingExternal(EXTERNAL_ART_SOURCES[meta.websiteKey]);
  };

  const renderIconGrid = (icons: LibraryIcon[]) => (
    <div className="ba-icon-grid">
      {icons.map((icon) => (
        <div key={icon.id} className="ba-icon-cell">
          <button
            className="ba-icon-card"
            draggable
            onDragStart={(e) => setIconDragData(e, icon)}
            onClick={() => void placeIcon(icon)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCtxMenu({ x: e.clientX, y: e.clientY, icon });
            }}
            title={`${icon.name} · right-click for options`}
          >
            <div className="ba-icon-thumb">
              {icon.svgContent ? (
                <img
                  src={svgToThumbDataUrl(icon.svgContent)}
                  alt={icon.name}
                  draggable={false}
                />
              ) : icon.path ? (
                <img src={icon.path} alt={icon.name} draggable={false} loading="lazy" />
              ) : null}
            </div>
            <div className="ba-icon-label">{icon.name}</div>
            {isMcpIcon(icon) && <span className="ba-license-pill">MCP</span>}
            {icon.folder && myView === 'all' && (
              <span className="ba-license-pill">{icon.folder}</span>
            )}
          </button>
          {isRemovableLibraryIcon(icon) && (
            <button
              type="button"
              className="ba-icon-delete"
              title="Remove from library"
              onClick={(e) => {
                e.stopPropagation();
                deleteIcon(icon);
              }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );

  const categoryPills = (
    <div className="ba-cats ba-mylib-cats">
      <button
        type="button"
        className={`ba-chip ${myView === 'all' ? 'active' : ''}`}
        onClick={() => setMyView('all')}
      >
        All{scopeIcons.length ? ` (${scopeIcons.length})` : ''}
      </button>
      {libraryCategories.map((cat) => {
        const count = countInCategory(cat);
        const isActive =
          myView.startsWith('cat:') && categoryKey(myView.slice(4)) === categoryKey(cat);
        const isRenaming = renamingCat === cat;
        return (
          <div key={cat} className="ba-cat-chip-wrap">
            {isRenaming ? (
              <form
                className="ba-cat-rename"
                onSubmit={(e) => {
                  e.preventDefault();
                  void commitRenameCategory(cat);
                }}
              >
                <input
                  className="ba-input ba-cat-rename-input"
                  value={renameValue}
                  autoFocus
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setRenamingCat(null);
                      setCatMenu(null);
                    }
                  }}
                />
                <button type="submit" className="ba-btn ba-btn-sm">
                  Save
                </button>
              </form>
            ) : (
              <button
                type="button"
                className={`ba-chip ba-cat-chip ${isActive ? 'active' : ''}`}
                title="Click to view · right‑click or ⋮ for options"
                onClick={() => {
                  setMyView(`cat:${cat}`);
                  setImportCategory(cat);
                }}
                onContextMenu={(e) => openCatMenu(cat, e)}
              >
                <span className="ba-cat-chip-text">
                  {cat}
                  {count ? ` (${count})` : ''}
                </span>
                <span
                  className="ba-cat-chip-more"
                  title="Category options"
                  aria-label={`Options for ${cat}`}
                  onClick={(e) => openCatMenu(cat, e)}
                  onContextMenu={(e) => openCatMenu(cat, e)}
                >
                  <MoreVertical size={12} strokeWidth={2.25} />
                </span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  const importPane = (
    <div className="ba-mylib-import-pane">
      {meta.websiteKey && (
        <button
          type="button"
          className="ba-btn ba-btn-sm ba-mylib-website-btn"
          onClick={openWebsite}
        >
          <ExternalLink size={14} /> Website
        </button>
      )}

      <div className="ba-mylib-folder-bar">
        <label
          className="ba-folder-label"
          title="Type a new category name, or pick an existing one. Next import goes here."
        >
          <span className="ba-mylib-field-label">Category</span>
          <input
            className="ba-input"
            list={`ba-cats-${scope}`}
            value={importCategory}
            onChange={(e) => setImportCategory(e.target.value)}
            placeholder="Name or select category…"
          />
        </label>
        <datalist id={`ba-cats-${scope}`}>
          {libraryCategories.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </div>

      <div className="ba-mylib-import-btns">
        <button
          type="button"
          className="ba-btn ba-btn-sm ba-mylib-import-btn"
          disabled={importBusy}
          onClick={() => fileRef.current?.click()}
          title="Import SVG files"
        >
          <Upload size={14} /> SVG
        </button>
        <button
          type="button"
          className="ba-btn ba-btn-sm ba-mylib-import-btn"
          disabled={importBusy}
          onClick={() => imageRef.current?.click()}
          title="Import PNG, JPEG, WebP, or GIF"
        >
          <ImageIcon size={14} /> Image
        </button>
        <button
          type="button"
          className="ba-btn ba-btn-sm ba-mylib-import-btn"
          disabled={importBusy}
          onClick={() => folderImportRef.current?.click()}
          title="Import a whole folder of icons"
        >
          <FolderOpen size={14} /> Folder
        </button>
        <button
          type="button"
          className="ba-btn ba-btn-sm ba-mylib-import-btn"
          disabled={importBusy}
          onClick={() => zipRef.current?.click()}
          title="Import a .zip — keeps SVG/PNG/JPEG/WebP/GIF only"
        >
          <Archive size={14} /> Zip
        </button>
      </div>

      <div
        className={`ba-import-zone ${dragOver ? 'dragover' : ''} ${importBusy ? 'ba-import-zone--busy' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void onImportFiles(e.dataTransfer.files);
        }}
      >
        <Upload size={18} />
        <p>{importBusy ? 'Importing…' : 'Drop SVG, images, folder, or .zip'}</p>
      </div>
    </div>
  );

  const browsePane = (
    <div className="ba-mylib-browse-pane">
      {categoryPills}
      <div className="ba-search">
        <Search size={14} color="#9ca3af" />
        <input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="ba-mylib-icon-scroll">
        {visibleIcons.length === 0 ? (
          <div className="ba-empty">
            {myView.startsWith('cat:')
              ? 'Nothing in this category yet.'
              : 'Empty — import SVG, images, a folder, or a zip above.'}
          </div>
        ) : (
          renderIconGrid(visibleIcons)
        )}
      </div>
    </div>
  );

  return (
    <aside className="ba-left-panel ba-left-panel--mylib">
      <div className="ba-panel-header">{meta.title}</div>

      <div className="ba-mylib-body">
        <PanelSplit
          storageKey={`bioartist-lib-split-${scope}-v1`}
          defaultRatio={0.38}
          topLabel="Import"
          bottomLabel="Library"
          top={importPane}
          bottom={browsePane}
        />
      </div>

      {catMenu &&
        createPortal(
          <div
            ref={catMenuRef}
            className="ba-cat-menu"
            role="menu"
            style={{ left: catMenu.x, top: catMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMyView(`cat:${catMenu.cat}`);
                setImportCategory(catMenu.cat);
                setCatMenu(null);
              }}
            >
              View
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setRenamingCat(catMenu.cat);
                setRenameValue(catMenu.cat);
                setCatMenu(null);
              }}
            >
              Rename…
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setImportCategory(catMenu.cat);
                setCatMenu(null);
                showToast(`Next import → ${catMenu.cat}`);
              }}
            >
              Use for next import
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => void removeCategory(catMenu.cat)}
            >
              Remove category
            </button>
          </div>,
          document.body,
        )}

      <input
        ref={fileRef}
        type="file"
        accept=".svg,image/svg+xml"
        multiple
        hidden
        onChange={(e) => {
          void onImportFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={imageRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp"
        multiple
        hidden
        onChange={(e) => {
          void onImportFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={(el) => {
          folderImportRef.current = el;
          if (el) {
            el.setAttribute('webkitdirectory', '');
            el.setAttribute('directory', '');
          }
        }}
        type="file"
        multiple
        accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
        hidden
        onChange={(e) => {
          void onImportFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={zipRef}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        multiple
        hidden
        onChange={(e) => {
          void onImportFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y}>
          <button
            type="button"
            onClick={() => {
              void placeIcon(ctxMenu.icon);
              setCtxMenu(null);
            }}
          >
            Place on canvas
          </button>
          {favorites.some((f) => f.id === ctxMenu.icon.id) ? (
            <button
              type="button"
              onClick={() => {
                removeFavorite(ctxMenu.icon.id);
                showToast(`Removed “${ctxMenu.icon.name}” from favorites`);
                setCtxMenu(null);
              }}
            >
              Remove from favorites
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                const ok = addFavorite(ctxMenu.icon);
                showToast(
                  ok
                    ? `Added “${ctxMenu.icon.name}” to favorites`
                    : `“${ctxMenu.icon.name}” is already in favorites`,
                );
                setCtxMenu(null);
              }}
            >
              Add to favorites
            </button>
          )}
          {isRemovableLibraryIcon(ctxMenu.icon) && (
            <>
              <div className="ba-ctx-sep" role="separator" />
              <div className="ba-ctx-heading">Move to category</div>
              <button
                type="button"
                onClick={() => void moveIconToCategory(ctxMenu.icon, null)}
              >
                Uncategorized
              </button>
              {libraryCategories.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={
                    categoryKey(ctxMenu.icon.folder || '') === categoryKey(c)
                      ? 'active'
                      : ''
                  }
                  onClick={() => void moveIconToCategory(ctxMenu.icon, c)}
                >
                  {c}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  const name = window.prompt(
                    'New category name',
                    ctxMenu.icon.folder || '',
                  );
                  if (name == null) return;
                  void moveIconToCategory(ctxMenu.icon, name);
                }}
              >
                New category…
              </button>
              <div className="ba-ctx-sep" role="separator" />
              <button
                type="button"
                className="danger"
                onClick={() => deleteIcon(ctxMenu.icon)}
              >
                Delete from library
              </button>
            </>
          )}
        </ContextMenu>
      )}

      <ExternalArtDialog
        target={pendingExternal}
        onCancel={() => setPendingExternal(null)}
        onApprove={(t) => {
          setPendingExternal(null);
          openExternalArtTarget(t);
          showToast(`Opened ${t.title} — verify license on each icon you use`);
        }}
      />
    </aside>
  );
}
