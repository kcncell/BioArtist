/**
 * Bioicons pack panel — install/browse the open catalog (restored pack UI).
 */
import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  isMcpIcon,
  isRemovableLibraryIcon,
  type LibraryIcon,
} from '../../data/catalog';
import {
  loadInstalledPack,
  packToLibraryIcons,
  uniqueCategories,
  type PackManifest,
} from '../../lib/packs';
import { placeLibraryIcon } from '../../lib/placeIcon';
import { setIconDragData } from '../../lib/iconDrag';
import { svgToThumbDataUrl } from '../../lib/svgImport';
import { useAppStore } from '../../store/appStore';
import { ContextMenu } from '../ui/ContextMenu';
import {
  EXTERNAL_ART_SOURCES,
  ExternalArtDialog,
  openExternalArtTarget,
  type ExternalArtTarget,
} from './ExternalArtDialog';
import { PackCards } from './PackCards';

export function BioiconsPanel() {
  const search = useAppStore((s) => s.search);
  const setSearch = useAppStore((s) => s.setSearch);
  const addFavorite = useAppStore((s) => s.addFavorite);
  const removeFavorite = useAppStore((s) => s.removeFavorite);
  const favorites = useAppStore((s) => s.favorites);
  const showToast = useAppStore((s) => s.showToast);

  const packBrowserRef = useRef<HTMLDivElement>(null);
  const [bioiconsPack, setBioiconsPack] = useState<PackManifest | null>(null);
  const [shelf, setShelf] = useState<'imports' | 'bioicons'>('bioicons');
  const [packCategory, setPackCategory] = useState('all');
  const [licenseFilter, setLicenseFilter] = useState<'all' | 'cc0' | 'attr'>('all');
  const [packShowLimit, setPackShowLimit] = useState(96);
  const [pendingExternal, setPendingExternal] = useState<ExternalArtTarget | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    icon: LibraryIcon;
  } | null>(null);

  const refreshPacks = useCallback(async () => {
    const b = await loadInstalledPack('bioicons');
    setBioiconsPack(b);
    if (b) setShelf('bioicons');
    else setShelf('imports');
  }, []);

  useEffect(() => {
    void refreshPacks();
  }, [refreshPacks]);

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

  const packIcons = useMemo(() => {
    if (!bioiconsPack) return [];
    return packToLibraryIcons(bioiconsPack);
  }, [bioiconsPack]);

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
      if (licenseFilter === 'cc0' && icon.license !== 'cc-0' && icon.license !== 'CC0')
        return false;
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

  const packSearching = search.trim().length > 0;
  const packInCategory = packCategory !== 'all';
  const packShowIcons = packInCategory || packSearching;

  const clearPackCategory = () => {
    setPackCategory('all');
    setSearch('');
    setPackShowLimit(96);
  };

  const togglePackCategory = (cat: string) => {
    if (packCategory === cat) clearPackCategory();
    else {
      setPackCategory(cat);
      setPackShowLimit(96);
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

  const browsing = shelf === 'bioicons' && !!bioiconsPack;

  return (
    <aside className="ba-left-panel">
      <div className="ba-panel-header">Bioicons</div>
      <div className="ba-panel-sub">
        Install the open catalog, then browse by category. Drag icons onto the canvas.
      </div>

      <PackCards
        bioicons={bioiconsPack}
        nih={null}
        activeShelf={shelf}
        mode="bioicons"
        onShelfChange={(s) => {
          setShelf(s === 'nih' ? 'imports' : s);
          setPackCategory('all');
          setSearch('');
          setPackShowLimit(96);
        }}
        onPacksChanged={() => void refreshPacks()}
      />

      {browsing && bioiconsPack && (
        <div
          className={`ba-pack-browser${packShowIcons ? ' ba-pack-browser--icons' : ''}`}
          ref={packBrowserRef}
        >
          {!packShowIcons && (
            <>
              <div className="ba-pack-credit ba-pack-credit--compact">
                Pick a category to browse icons ·{' '}
                <button
                  type="button"
                  className="ba-link-btn"
                  onClick={() => setPendingExternal(EXTERNAL_ART_SOURCES.bioicons)}
                >
                  {bioiconsPack.title} website
                </button>
              </div>

              <div className="ba-search">
                <Search size={14} color="#9ca3af" />
                <input
                  placeholder={`Search all ${bioiconsPack.title}…`}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPackShowLimit(96);
                  }}
                />
              </div>

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
                      : `Search ${bioiconsPack.title}…`
                  }
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPackShowLimit(96);
                  }}
                />
              </div>

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

              <div className="ba-panel-sub" style={{ paddingTop: 0, paddingBottom: 2 }}>
                {Math.min(packShowLimit, packFiltered.length).toLocaleString()} /{' '}
                {packFiltered.length.toLocaleString()} icons
              </div>

              <div className="ba-pack-icon-scroll">
                <div className="ba-icon-grid">
                  {packFiltered.slice(0, packShowLimit).map((icon) => (
                    <button
                      key={icon.id}
                      className="ba-icon-card"
                      draggable
                      onDragStart={(e) => setIconDragData(e, icon)}
                      onClick={() => void placeIcon(icon)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCtxMenu({ x: e.clientX, y: e.clientY, icon });
                      }}
                      title={`${icon.name}${icon.author ? ` · ${icon.author}` : ''} · ${icon.licenseLabel || ''}`}
                    >
                      <div className="ba-icon-thumb">
                        {icon.path ? (
                          <img
                            src={icon.path}
                            alt={icon.name}
                            draggable={false}
                            loading="lazy"
                          />
                        ) : icon.svgContent ? (
                          <img
                            src={svgToThumbDataUrl(icon.svgContent)}
                            alt={icon.name}
                            draggable={false}
                          />
                        ) : null}
                      </div>
                      <div className="ba-icon-label">{icon.name}</div>
                      {icon.licenseLabel && (
                        <span
                          className={`ba-license-pill ${icon.attributionRequired ? 'warn' : ''}`}
                        >
                          {icon.licenseLabel}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
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

      {!bioiconsPack && (
        <div className="ba-empty">Install the Bioicons pack above to browse icons here.</div>
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
            <button type="button" className="danger" disabled>
              Catalog icon
            </button>
          ) : (
            <button type="button" disabled title="Catalog icons stay installed">
              Catalog (can’t delete)
            </button>
          )}
          {isMcpIcon(ctxMenu.icon) ? null : null}
        </ContextMenu>
      )}
    </aside>
  );
}
