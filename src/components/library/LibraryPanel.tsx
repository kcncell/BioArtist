import { Search, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BUILTIN_ICONS,
  CATEGORIES,
  isMcpIcon,
  isRemovableLibraryIcon,
  type LibraryIcon,
} from '../../data/catalog';
import {
  addImageFromDataUrl,
  addSvgToCanvas,
  fetchSvgText,
} from '../../lib/canvasController';
import {
  loadInstalledPack,
  packToLibraryIcons,
  uniqueCategories,
  type PackManifest,
} from '../../lib/packs';
import { setIconDragData } from '../../lib/iconDrag';
import { readSvgFiles, svgToThumbDataUrl } from '../../lib/svgImport';
import { useAppStore } from '../../store/appStore';
import { ContextMenu } from '../ui/ContextMenu';
import { AiPanel } from './AiPanel';
import { ChemPanel } from './ChemPanel';
import {
  EXTERNAL_ART_SOURCES,
  ExternalArtDialog,
  openExternalArtTarget,
  type ExternalArtTarget,
} from './ExternalArtDialog';
import { PackCards } from './PackCards';
import { PdbPanel } from './PdbPanel';
import { ShapeLinePanel } from './ShapeLinePanel';
import { TemplatesPanel } from './TemplatesPanel';

type Shelf = 'imports' | 'bioicons' | 'nih';

export function LibraryPanel() {
  const tool = useAppStore((s) => s.tool);
  const libraryTab = useAppStore((s) => s.libraryTab);
  const search = useAppStore((s) => s.search);
  const category = useAppStore((s) => s.category);
  const userLibrary = useAppStore((s) => s.userLibrary);
  const setSearch = useAppStore((s) => s.setSearch);
  const setCategory = useAppStore((s) => s.setCategory);
  const setLibraryTab = useAppStore((s) => s.setLibraryTab);
  const addUserIcons = useAppStore((s) => s.addUserIcons);
  const removeUserIcon = useAppStore((s) => s.removeUserIcon);
  const addFavorite = useAppStore((s) => s.addFavorite);
  const removeFavorite = useAppStore((s) => s.removeFavorite);
  const favorites = useAppStore((s) => s.favorites);
  const showToast = useAppStore((s) => s.showToast);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const packBrowserRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [bioiconsPack, setBioiconsPack] = useState<PackManifest | null>(null);
  const [nihPack, setNihPack] = useState<PackManifest | null>(null);
  const [shelf, setShelf] = useState<Shelf>('imports');
  const [packCategory, setPackCategory] = useState('all');
  const [licenseFilter, setLicenseFilter] = useState<'all' | 'cc0' | 'attr'>('all');
  /** Cap pack grid for first paint; "Show more" raises this. */
  const [packShowLimit, setPackShowLimit] = useState(96);
  const [pendingExternal, setPendingExternal] = useState<ExternalArtTarget | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    icon: LibraryIcon;
  } | null>(null);

  const openPackWebsite = () => {
    if (shelf === 'bioicons') setPendingExternal(EXTERNAL_ART_SOURCES.bioicons);
    else if (shelf === 'nih') setPendingExternal(EXTERNAL_ART_SOURCES.nih);
  };

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

  const refreshPacks = useCallback(async () => {
    const [b, n] = await Promise.all([loadInstalledPack('bioicons'), loadInstalledPack('nih')]);
    setBioiconsPack(b);
    setNihPack(n);
  }, []);

  useEffect(() => {
    void refreshPacks();
  }, [refreshPacks]);

  // Entering a pack shelf: start at category list (not a crowded icon dump).
  useEffect(() => {
    if (shelf === 'imports') return;
    setPackCategory('all');
    setPackShowLimit(96);
    setSearch('');
    const t = window.setTimeout(() => {
      packBrowserRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
    return () => window.clearTimeout(t);
  }, [shelf, setSearch]);

  const activePack =
    shelf === 'bioicons' ? bioiconsPack : shelf === 'nih' ? nihPack : null;

  const packIcons = useMemo(() => {
    if (!activePack) return [];
    return packToLibraryIcons(activePack);
  }, [activePack]);

  const packCats = useMemo(() => uniqueCategories(packIcons), [packIcons]);

  const packCatCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const icon of packIcons) {
      map.set(icon.category, (map.get(icon.category) || 0) + 1);
    }
    return map;
  }, [packIcons]);

  const packFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return packIcons.filter((icon) => {
      if (packCategory !== 'all' && icon.category !== packCategory) return false;
      if (licenseFilter === 'cc0' && icon.license !== 'cc-0' && icon.license !== 'CC0') return false;
      if (licenseFilter === 'attr' && !icon.attributionRequired) return false;
      if (!q) return true;
      return (
        icon.name.toLowerCase().includes(q) ||
        icon.category.toLowerCase().includes(q) ||
        (icon.author || '').toLowerCase().includes(q) ||
        (icon.licenseLabel || '').toLowerCase().includes(q)
      );
    });
  }, [packIcons, packCategory, licenseFilter, search]);

  /** Category list first; icons only after picking a category (or searching). */
  const packSearching = search.trim().length > 0;
  const packInCategory = packCategory !== 'all';
  const packShowIcons = packInCategory || packSearching;

  const clearPackCategory = () => {
    setPackCategory('all');
    setSearch('');
    setPackShowLimit(96);
  };

  const togglePackCategory = (cat: string) => {
    if (packCategory === cat) {
      clearPackCategory();
    } else {
      setPackCategory(cat);
      setPackShowLimit(96);
    }
  };

  const mcpIcons = useMemo(() => userLibrary.filter(isMcpIcon), [userLibrary]);

  const libraryFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchQ = (icon: LibraryIcon) => {
      if (!q) return true;
      return (
        icon.name.toLowerCase().includes(q) ||
        icon.category.toLowerCase().includes(q) ||
        (icon.author || '').toLowerCase().includes(q)
      );
    };

    // Dedicated mini-tab for MCP-synced icons
    if (category === 'mcp') {
      return mcpIcons.filter(matchQ);
    }

    return BUILTIN_ICONS.filter((icon) => {
      if (category !== 'all' && icon.category !== category) return false;
      return matchQ(icon);
    });
  }, [search, category, mcpIcons]);

  const userFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return userLibrary.filter((icon) => {
      if (!q) return true;
      return icon.name.toLowerCase().includes(q);
    });
  }, [userLibrary, search]);

  const deleteIcon = (icon: LibraryIcon) => {
    if (!isRemovableLibraryIcon(icon)) {
      showToast('Built-in icons can’t be deleted');
      setCtxMenu(null);
      return;
    }
    removeUserIcon(icon.id);
    showToast(`Deleted “${icon.name}”`);
    setCtxMenu(null);
  };

  const onImportFiles = async (files: FileList | File[] | null) => {
    if (!files || !files.length) return;
    const list = Array.from(files);
    const svgs = list.filter(
      (f) => f.type === 'image/svg+xml' || f.name.toLowerCase().endsWith('.svg'),
    );
    const rasters = list.filter(
      (f) =>
        !svgs.includes(f) &&
        (/\.(png|jpe?g|webp|gif)$/i.test(f.name) ||
          (f.type.startsWith('image/') && f.type !== 'image/svg+xml')),
    );

    try {
      if (svgs.length) {
        const icons = await readSvgFiles(svgs);
        if (icons.length) {
          const ok = await addUserIcons(icons);
          if (ok) {
            showToast(`Imported ${icons.length} SVG${icons.length > 1 ? 's' : ''} to My Library`);
            setShelf('imports');
          }
        } else if (!rasters.length) {
          showToast('No valid SVG files found');
        }
      }
      if (rasters.length) {
        const rasterIcons: LibraryIcon[] = [];
        for (const file of rasters) {
          const dataUrl = await readFileAsDataUrl(file);
          rasterIcons.push({
            id: `user/img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name.replace(/\.[^.]+$/, ''),
            category: 'symbols',
            path: dataUrl,
            source: 'user',
          });
        }
        const ok = await addUserIcons(rasterIcons);
        if (ok) {
          showToast(
            `Imported ${rasterIcons.length} image${rasterIcons.length > 1 ? 's' : ''} to My Library`,
          );
          setShelf('imports');
        }
      }
    } catch {
      showToast('Import failed');
    }
  };

  const onImportRaster = async (files: FileList | null) => {
    if (!files?.length) return;
    const icons: LibraryIcon[] = [];
    try {
      for (const file of Array.from(files)) {
        const dataUrl = await readFileAsDataUrl(file);
        icons.push({
          id: `user/img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name.replace(/\.[^.]+$/, ''),
          category: 'symbols',
          path: dataUrl,
          source: 'user',
        });
      }
      const ok = await addUserIcons(icons);
      if (ok) {
        showToast(`Imported ${icons.length} image${icons.length > 1 ? 's' : ''} to My Library`);
        setShelf('imports');
      }
    } catch {
      showToast('Image import failed');
    }
  };

  const placeIcon = async (icon: LibraryIcon) => {
    try {
      if (icon.path?.startsWith('data:image') && !icon.path.includes('svg')) {
        await addImageFromDataUrl(icon.path, { name: icon.name });
        return;
      }
      let svg = icon.svgContent;
      if (!svg && icon.path && !icon.path.startsWith('data:')) {
        svg = await fetchSvgText(icon.path);
      }
      if (!svg && icon.path?.startsWith('data:image/svg')) {
        svg = decodeURIComponent(icon.path.split(',')[1] || '');
      }
      if (!svg) {
        showToast('Could not load icon');
        return;
      }
      await addSvgToCanvas(svg, { name: icon.name });
      if (icon.attributionRequired) {
        showToast(`Placed “${icon.name}” · ${icon.licenseLabel || 'attribution may be required'}`);
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to place icon (network or file error)');
    }
  };

  const onDragStart = (e: React.DragEvent, icon: LibraryIcon) => {
    setIconDragData(e, icon);
  };

  const openCtx = (e: React.MouseEvent, icon: LibraryIcon) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, icon });
  };

  // Drawing / template / PDB / AI / Chem tools take over the left panel
  if (tool === 'chem') {
    return <ChemPanel />;
  }
  if (tool === 'ai') {
    return <AiPanel />;
  }
  if (tool === 'templates') {
    return <TemplatesPanel />;
  }
  if (tool === 'pdb') {
    return <PdbPanel />;
  }
  if (tool === 'shapes' || tool === 'lines' || tool === 'text') {
    return <ShapeLinePanel />;
  }

  const renderIconGrid = (icons: LibraryIcon[], showLicense?: boolean) => (
    <div className="ba-icon-grid">
      {icons.map((icon) => (
        <button
          key={icon.id}
          className="ba-icon-card"
          draggable
          onDragStart={(e) => onDragStart(e, icon)}
          onClick={() => void placeIcon(icon)}
          onContextMenu={(e) => openCtx(e, icon)}
          title={
            showLicense
              ? `${icon.name}${icon.author ? ` · ${icon.author}` : ''} · ${icon.licenseLabel || ''}`
              : `${icon.name} · right-click for options`
          }
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
          {showLicense && icon.licenseLabel && (
            <span className={`ba-license-pill ${icon.attributionRequired ? 'warn' : ''}`}>
              {icon.licenseLabel}
            </span>
          )}
          {isMcpIcon(icon) && !showLicense && (
            <span className="ba-license-pill">MCP</span>
          )}
        </button>
      ))}
    </div>
  );

  return (
    <aside className="ba-left-panel">
      <div className="ba-panel-header">Assets</div>
      <div className="ba-panel-sub">
        Icons stay here while you work. Drag onto canvas. Use the left rail for Templates, PDB,
        shapes, lines, and text.
      </div>

      <div className="ba-tabs">
        <button
          className={`ba-tab ${libraryTab === 'library' ? 'active' : ''}`}
          onClick={() => setLibraryTab('library')}
        >
          Library
        </button>
        <button
          className={`ba-tab ${libraryTab === 'uploads' ? 'active' : ''}`}
          onClick={() => setLibraryTab('uploads')}
        >
          My Library
          {userLibrary.length > 0 && <span className="ba-tab-count">{userLibrary.length}</span>}
        </button>
      </div>

      {libraryTab === 'library' && (
        <>
          <div style={{ padding: '0 12px 10px', display: 'flex', gap: 6 }}>
            <button
              className="ba-btn ba-btn-primary ba-btn-sm"
              style={{ flex: 1 }}
              onClick={() => {
                setLibraryTab('uploads');
                window.setTimeout(() => fileRef.current?.click(), 0);
              }}
            >
              <Upload size={14} /> Import SVG
            </button>
            <button
              className="ba-btn ba-btn-sm"
              title="Import PNG/JPG"
              onClick={() => imageRef.current?.click()}
            >
              Image
            </button>
          </div>

          <div className="ba-search">
            <Search size={14} color="#9ca3af" />
            <input
              placeholder="Search icons…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="ba-cats">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                className={`ba-chip ${category === c.id ? 'active' : ''}`}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
                {c.id === 'mcp' && mcpIcons.length > 0 ? ` (${mcpIcons.length})` : ''}
              </button>
            ))}
          </div>

          {category === 'mcp' && mcpIcons.length === 0 && (
            <div className="ba-empty">
              No MCP icons yet. Open <strong>My Library</strong> → <strong>Sync MCP inbox</strong>,
              then they show up here under <strong>MCP imported</strong>. Right-click any import to
              delete.
            </div>
          )}

          {renderIconGrid(libraryFiltered, category === 'mcp')}
          {libraryFiltered.length === 0 && category !== 'mcp' && (
            <div className="ba-empty">No icons match your search.</div>
          )}
        </>
      )}

      {libraryTab === 'uploads' && (
        <>
          <PackCards
            bioicons={bioiconsPack}
            nih={nihPack}
            activeShelf={shelf}
            onShelfChange={(s) => {
              setShelf(s);
              setPackCategory('all');
              setSearch('');
              setPackShowLimit(96);
            }}
            onPacksChanged={() => void refreshPacks()}
            onMcpSynced={() => setShelf('imports')}
          />

          {shelf === 'imports' && (
            <>
              <div
                className={`ba-import-zone ${dragOver ? 'dragover' : ''}`}
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
                <Upload size={20} />
                <p>
                  Drop SVG or images, or{' '}
                  <button
                    className="ba-btn ba-btn-sm"
                    style={{
                      display: 'inline',
                      color: 'var(--ba-accent)',
                      padding: 0,
                      height: 'auto',
                    }}
                    onClick={() => fileRef.current?.click()}
                  >
                    browse SVG
                  </button>
                  {' / '}
                  <button
                    className="ba-btn ba-btn-sm"
                    style={{
                      display: 'inline',
                      color: 'var(--ba-accent)',
                      padding: 0,
                      height: 'auto',
                    }}
                    onClick={() => imageRef.current?.click()}
                  >
                    browse image
                  </button>
                </p>
              </div>

              <div className="ba-search">
                <Search size={14} color="#9ca3af" />
                <input
                  placeholder="Search imports…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {userFiltered.length === 0 ? (
                <div className="ba-empty">
                  No personal imports yet. Use the packs above, Sync MCP, or drop SVG files.
                </div>
              ) : (
                <div className="ba-icon-grid">
                  {userFiltered.map((icon) => (
                    <div key={icon.id} className="ba-icon-cell">
                      <button
                        className="ba-icon-card"
                        draggable
                        onDragStart={(e) => onDragStart(e, icon)}
                        onClick={() => void placeIcon(icon)}
                        onContextMenu={(e) => openCtx(e, icon)}
                        title={`${icon.name} · right-click to delete`}
                      >
                        <div className="ba-icon-thumb">
                          {icon.svgContent ? (
                            <img src={svgToThumbDataUrl(icon.svgContent)} alt={icon.name} />
                          ) : icon.path ? (
                            <img src={icon.path} alt={icon.name} />
                          ) : null}
                        </div>
                        <div className="ba-icon-label">{icon.name}</div>
                        {isMcpIcon(icon) && <span className="ba-license-pill">MCP</span>}
                      </button>
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
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {shelf !== 'imports' && activePack && (
            <div
              className={`ba-pack-browser${packShowIcons ? ' ba-pack-browser--icons' : ''}`}
              ref={packBrowserRef}
            >
              {/* Category list mode: pick a category first — roomy list, no tiny grid */}
              {!packShowIcons && (
                <>
                  <div className="ba-pack-credit ba-pack-credit--compact">
                    Pick a category to browse icons ·{' '}
                    <button type="button" className="ba-link-btn" onClick={openPackWebsite}>
                      {activePack.title} website
                    </button>
                  </div>

                  <div className="ba-search">
                    <Search size={14} color="#9ca3af" />
                    <input
                      placeholder={`Search all ${activePack.title}…`}
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPackShowLimit(96);
                      }}
                    />
                  </div>

                  {shelf === 'bioicons' && (
                    <div className="ba-cats ba-cats--compact">
                      <button
                        type="button"
                        className={`ba-chip ${licenseFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setLicenseFilter('all')}
                      >
                        All licenses
                      </button>
                      <button
                        type="button"
                        className={`ba-chip ${licenseFilter === 'cc0' ? 'active' : ''}`}
                        onClick={() => setLicenseFilter('cc0')}
                      >
                        CC0
                      </button>
                      <button
                        type="button"
                        className={`ba-chip ${licenseFilter === 'attr' ? 'active' : ''}`}
                        onClick={() => setLicenseFilter('attr')}
                      >
                        Needs credit
                      </button>
                    </div>
                  )}

                  <div className="ba-panel-sub" style={{ paddingTop: 0, paddingBottom: 4 }}>
                    {packCats.length} categories · {packIcons.length.toLocaleString()} icons
                  </div>

                  <div className="ba-pack-cat-list" role="list">
                    {packCats.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="ba-pack-cat-item"
                        role="listitem"
                        onClick={() => togglePackCategory(c)}
                      >
                        <span className="ba-pack-cat-item-name">{c}</span>
                        <span className="ba-pack-cat-item-count">
                          {(packCatCounts.get(c) || 0).toLocaleString()}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Icon mode: one category (or search) — hide other category names, max space for grid */}
              {packShowIcons && (
                <>
                  <div className="ba-pack-cat-active">
                    <button
                      type="button"
                      className="ba-btn ba-btn-sm"
                      onClick={clearPackCategory}
                      title="Back to all categories"
                    >
                      ← All categories
                    </button>
                    {packInCategory && (
                      <button
                        type="button"
                        className="ba-chip active"
                        onClick={() => togglePackCategory(packCategory)}
                        title="Deselect category and show list again"
                      >
                        {packCategory} ×
                      </button>
                    )}
                    {packSearching && !packInCategory && (
                      <span className="ba-pack-cat-search-label">Search results</span>
                    )}
                  </div>

                  <div className="ba-search">
                    <Search size={14} color="#9ca3af" />
                    <input
                      placeholder={
                        packInCategory
                          ? `Search in ${packCategory}…`
                          : `Search ${activePack.title}…`
                      }
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPackShowLimit(96);
                      }}
                    />
                  </div>

                  {shelf === 'bioicons' && (
                    <div className="ba-cats ba-cats--compact">
                      <button
                        type="button"
                        className={`ba-chip ${licenseFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setLicenseFilter('all')}
                      >
                        All licenses
                      </button>
                      <button
                        type="button"
                        className={`ba-chip ${licenseFilter === 'cc0' ? 'active' : ''}`}
                        onClick={() => setLicenseFilter('cc0')}
                      >
                        CC0
                      </button>
                      <button
                        type="button"
                        className={`ba-chip ${licenseFilter === 'attr' ? 'active' : ''}`}
                        onClick={() => setLicenseFilter('attr')}
                      >
                        Needs credit
                      </button>
                    </div>
                  )}

                  <div className="ba-panel-sub" style={{ paddingTop: 0, paddingBottom: 2 }}>
                    {Math.min(packShowLimit, packFiltered.length).toLocaleString()} /{' '}
                    {packFiltered.length.toLocaleString()} icons
                  </div>

                  <div className="ba-pack-icon-scroll">
                    {renderIconGrid(packFiltered.slice(0, packShowLimit), true)}
                    {packFiltered.length > packShowLimit && (
                      <div style={{ padding: '8px 12px 16px' }}>
                        <button
                          type="button"
                          className="ba-btn ba-btn-sm"
                          style={{ width: '100%' }}
                          onClick={() => setPackShowLimit((n) => n + 96)}
                        >
                          Show more (
                          {(packFiltered.length - packShowLimit).toLocaleString()} remaining)
                        </button>
                      </div>
                    )}
                    {packFiltered.length === 0 && (
                      <div className="ba-empty">
                        No icons match.{' '}
                        <button
                          type="button"
                          className="ba-btn ba-btn-sm"
                          onClick={clearPackCategory}
                        >
                          Back to categories
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {shelf !== 'imports' && !activePack && (
            <div className="ba-empty">
              Pack data missing in this browser. Re-install the pack, or{' '}
              <button type="button" className="ba-link-btn" onClick={openPackWebsite}>
                open the website
              </button>
              .
            </div>
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
        </>
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
          void onImportRaster(e.target.files);
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
          {isRemovableLibraryIcon(ctxMenu.icon) ? (
            <button
              type="button"
              className="danger"
              onClick={() => deleteIcon(ctxMenu.icon)}
            >
              Delete from library
            </button>
          ) : (
            <button type="button" disabled title="Built-in icons stay in the catalog">
              Built-in (can’t delete)
            </button>
          )}
        </ContextMenu>
      )}
    </aside>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
