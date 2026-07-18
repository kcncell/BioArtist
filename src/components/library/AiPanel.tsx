import {
  ClipboardPaste,
  Copy,
  Image as ImageIcon,
  Library,
  Loader2,
  Pin,
  PinOff,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  isMcpIcon,
  isRemovableLibraryIcon,
  type LibraryIcon,
} from '../../data/catalog';
import {
  AI_QUICK_PROMPTS,
  AI_SETUP_STEPS,
  MCP_CONFIG_SNIPPET,
} from '../../lib/aiPrompts';
import {
  addImageFromDataUrl,
  addSvgToCanvas,
  fetchSvgText,
} from '../../lib/canvasController';
import { pasteResultToLibraryIcon } from '../../lib/clipboardPaste';
import { setIconDragData } from '../../lib/iconDrag';
import { loadMcpInboxIcons } from '../../lib/mcpInbox';
import { readSvgFiles, svgToThumbDataUrl } from '../../lib/svgImport';
import { sortTemplatesByPin } from '../../lib/templates';
import { useAppStore } from '../../store/appStore';
import { ContextMenu } from '../ui/ContextMenu';

export function AiPanel() {
  const showToast = useAppStore((s) => s.showToast);
  const setTool = useAppStore((s) => s.setTool);
  const setLibraryTab = useAppStore((s) => s.setLibraryTab);
  const userLibrary = useAppStore((s) => s.userLibrary);
  const pinnedIconIds = useAppStore((s) => s.pinnedIconIds);
  const addUserIcons = useAppStore((s) => s.addUserIcons);
  const removeUserIcon = useAppStore((s) => s.removeUserIcon);
  const togglePinIcon = useAppStore((s) => s.togglePinIcon);
  const addFavorite = useAppStore((s) => s.addFavorite);
  const removeFavorite = useAppStore((s) => s.removeFavorite);
  const favorites = useAppStore((s) => s.favorites);

  const svgRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    icon: LibraryIcon;
  } | null>(null);

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

  const aiIcons = useMemo(() => {
    const list = userLibrary.filter(
      (i) => isMcpIcon(i) || i.source === 'user' || isRemovableLibraryIcon(i),
    );
    const seen = new Set<string>();
    const unique = list.filter((i) => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    });
    return sortTemplatesByPin(unique, pinnedIconIds, (i) => i.id);
  }, [userLibrary, pinnedIconIds]);

  const mcpCount = useMemo(() => userLibrary.filter(isMcpIcon).length, [userLibrary]);

  const goLibrary = () => {
    setTool('library');
    setLibraryTab('library');
  };

  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(okMsg);
    } catch {
      showToast('Could not copy — select text manually');
    }
  };

  const syncMcp = async () => {
    setBusy(true);
    try {
      const icons = await loadMcpInboxIcons();
      if (!icons.length) {
        showToast('Inbox empty — generate icons in an AI app first, then Sync');
        setShowSetup(true);
        return;
      }
      const ok = await addUserIcons(icons, { stayOnTool: true });
      if (ok) {
        showToast(`Synced ${icons.length} AI icon${icons.length > 1 ? 's' : ''} — click to place`);
      }
    } catch (e) {
      console.error(e);
      showToast('Could not read MCP inbox — open setup below for help');
      setShowSetup(true);
    } finally {
      setBusy(false);
    }
  };

  const placeIcon = async (icon: LibraryIcon) => {
    try {
      if (icon.path?.startsWith('data:image') && !icon.path.includes('svg')) {
        await addImageFromDataUrl(icon.path, { name: icon.name });
        showToast(`Placed “${icon.name}”`);
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
      showToast(`Placed “${icon.name}”`);
    } catch (e) {
      console.error(e);
      showToast('Failed to place icon');
    }
  };

  const importSvgs = async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    const icons = await readSvgFiles(files);
    if (!icons.length) {
      showToast('No valid SVG files');
      return;
    }
    const ok = await addUserIcons(icons, { stayOnTool: true });
    if (ok) showToast(`Imported ${icons.length} SVG${icons.length > 1 ? 's' : ''}`);
  };

  const importImages = async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    const icons: LibraryIcon[] = [];
    for (const file of Array.from(files)) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      icons.push({
        id: `user/img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name.replace(/\.[^.]+$/, ''),
        category: 'symbols',
        path: dataUrl,
        source: 'user',
      });
    }
    const ok = await addUserIcons(icons, { stayOnTool: true });
    if (ok) showToast(`Imported ${icons.length} image${icons.length > 1 ? 's' : ''}`);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (!files?.length) return;
    const list = Array.from(files);
    const svgs = list.filter(
      (f) => f.type === 'image/svg+xml' || f.name.toLowerCase().endsWith('.svg'),
    );
    const rasters = list.filter(
      (f) =>
        !svgs.includes(f) &&
        (/\.(png|jpe?g|webp|gif)$/i.test(f.name) || f.type.startsWith('image/')),
    );
    void (async () => {
      if (svgs.length) await importSvgs(svgs);
      if (rasters.length) await importImages(rasters);
    })();
  };

  const pasteFromClipboard = async () => {
    try {
      // Prefer async clipboard when available (user gesture)
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const svgType = item.types.find((t) => t.includes('svg') || t === 'text/html' || t === 'text/plain');
          if (svgType) {
            const blob = await item.getType(svgType);
            const text = await blob.text();
            if (text.includes('<svg')) {
              const icon = pasteResultToLibraryIcon({
                kind: 'svg',
                name: 'Pasted SVG',
                svgContent: text,
              });
              if (icon) {
                await addUserIcons([icon], { stayOnTool: true });
                await addSvgToCanvas(text, { name: icon.name });
                showToast('Pasted SVG onto canvas + library');
                return;
              }
            }
          }
          const imgType = item.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(String(r.result));
              r.onerror = () => reject(r.error);
              r.readAsDataURL(blob);
            });
            await addImageFromDataUrl(dataUrl, { name: 'Pasted image' });
            await addUserIcons(
              [
                {
                  id: `user/paste-${Date.now()}`,
                  name: 'Pasted image',
                  category: 'symbols',
                  path: dataUrl,
                  source: 'user',
                },
              ],
              { stayOnTool: true },
            );
            showToast('Pasted image onto canvas + library');
            return;
          }
        }
      }
      showToast('Nothing pasteable — copy an SVG or image first, or use ⌘V on the canvas');
    } catch {
      showToast('Clipboard blocked — try drop / import, or ⌘V on the canvas');
    }
  };

  const isPinned = (id: string) => pinnedIconIds.includes(id);

  const iconsGrid = (
    <div className="ba-ai-half-icons">
      {aiIcons.length === 0 ? (
        <div className="ba-empty ba-ai-empty-sm">No imports yet</div>
      ) : (
        <div className="ba-icon-grid ba-ai-icon-grid">
          {aiIcons.map((icon) => {
            const pinned = isPinned(icon.id);
            return (
              <div key={icon.id} className={`ba-icon-cell ${pinned ? 'pinned' : ''}`}>
                <button
                  type="button"
                  className="ba-icon-card"
                  draggable
                  title={`${icon.name} · drag to favorites or canvas · click to place`}
                  onDragStart={(e) => setIconDragData(e, icon)}
                  onClick={() => void placeIcon(icon)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCtxMenu({ x: e.clientX, y: e.clientY, icon });
                  }}
                >
                  <div className="ba-icon-thumb">
                    {icon.svgContent ? (
                      <img
                        src={svgToThumbDataUrl(icon.svgContent)}
                        alt={icon.name}
                        draggable={false}
                      />
                    ) : icon.path ? (
                      <img src={icon.path} alt={icon.name} draggable={false} />
                    ) : null}
                  </div>
                  <div className="ba-icon-label">
                    {pinned && <Pin size={9} className="ba-template-pin-icon" />}
                    {icon.name}
                  </div>
                  {isMcpIcon(icon) && <span className="ba-license-pill">MCP</span>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <aside className="ba-left-panel ba-ai-panel">
      <div className="ba-panel-header">
        <span className="ba-ai-panel-title">
          <Sparkles size={16} strokeWidth={1.75} />
          AI import
        </span>
      </div>

      <div style={{ padding: '0 12px 8px' }}>
        <button className="ba-btn" style={{ width: '100%' }} onClick={goLibrary}>
          <Library size={14} /> Back to icon library
        </button>
      </div>

      <div className="ba-ai-split">
        {/* ── TOP HALF: drop + import (biologist-friendly) ── */}
        <section className="ba-ai-half ba-ai-half-top">
          <div className="ba-ai-half-label">Drop & import</div>
          <p className="ba-ai-half-desc">
            Easiest path: get an SVG/PNG from any AI chat, then drop or import it here.
          </p>

          <div
            className={`ba-ai-drop ba-ai-drop-lg ${dragOver ? 'dragover' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <Upload size={20} strokeWidth={1.5} />
            <strong>Drop SVG or PNG here</strong>
            <span>from ChatGPT, Claude, Grok, desktop…</span>
          </div>

          <div className="ba-ai-import-row">
            <button className="ba-btn ba-btn-primary ba-btn-sm" onClick={() => svgRef.current?.click()}>
              <Upload size={14} /> Import SVG
            </button>
            <button className="ba-btn ba-btn-sm" onClick={() => imgRef.current?.click()}>
              <ImageIcon size={14} /> Import image
            </button>
          </div>
          <button
            className="ba-btn ba-btn-sm ba-ai-paste-btn"
            onClick={() => void pasteFromClipboard()}
            title="Paste SVG or image from clipboard"
          >
            <ClipboardPaste size={14} /> Paste from clipboard
          </button>

          <input
            ref={svgRef}
            type="file"
            accept=".svg,image/svg+xml"
            multiple
            hidden
            onChange={(e) => {
              void importSvgs(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={imgRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp"
            multiple
            hidden
            onChange={(e) => {
              void importImages(e.target.files);
              e.target.value = '';
            }}
          />

          <div className="ba-quick-label ba-ai-icons-label">
            Your imports {aiIcons.length > 0 ? `(${aiIcons.length})` : ''}
            <span className="ba-ai-hint-inline"> · click place · right-click pin</span>
          </div>
          {iconsGrid}
        </section>

        {/* ── BOTTOM HALF: MCP (power users) ── */}
        <section className="ba-ai-half ba-ai-half-bottom">
          <div className="ba-ai-half-label">
            <Sparkles size={12} /> MCP (advanced)
          </div>
          <p className="ba-ai-half-desc">
            Desktop AI writes icons into a local inbox. Sync once to pull them in.
          </p>

          <button
            className="ba-btn ba-btn-primary ba-ai-sync-btn"
            disabled={busy}
            onClick={() => void syncMcp()}
          >
            {busy ? (
              <>
                <Loader2 size={15} className="ba-spin" /> Syncing…
              </>
            ) : (
              <>
                <Sparkles size={15} /> Sync MCP inbox
                {mcpCount > 0 ? ` (${mcpCount})` : ''}
              </>
            )}
          </button>

          <div className="ba-ai-prompts">
            {AI_QUICK_PROMPTS.slice(0, 4).map((p) => (
              <button
                key={p.id}
                type="button"
                className="ba-ai-prompt-chip"
                title={p.prompt}
                onClick={() => void copyText(p.prompt, `“${p.label}” prompt copied`)}
              >
                <Copy size={11} /> {p.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="ba-ai-section-toggle"
            onClick={() => setShowSetup((v) => !v)}
          >
            <span>MCP setup (once)</span>
            <span className="ba-ai-chevron">{showSetup ? '▾' : '▸'}</span>
          </button>
          {showSetup && (
            <div className="ba-ai-setup">
              <ol className="ba-ai-steps">
                {AI_SETUP_STEPS.map((s) => (
                  <li key={s.n}>
                    <strong>
                      {s.n}. {s.title}
                    </strong>
                    <span>{s.body}</span>
                  </li>
                ))}
              </ol>
              <div className="ba-ai-config-block">
                <div className="ba-ai-config-head">
                  <span>Server name: bioartist</span>
                  <button
                    type="button"
                    className="ba-btn ba-btn-sm"
                    onClick={() =>
                      void copyText(MCP_CONFIG_SNIPPET, 'Config copied — paste into your AI app')
                    }
                  >
                    <Copy size={12} /> Copy config
                  </button>
                </div>
                <pre className="ba-ai-config-pre">{MCP_CONFIG_SNIPPET}</pre>
                <p className="ba-ai-hint">
                  Replace <code>PATH/TO/BioArtist</code> with your repo path. Run{' '}
                  <code>npm run mcp:install</code> once.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

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
          <button
            type="button"
            onClick={() => {
              togglePinIcon(ctxMenu.icon.id);
              showToast(
                isPinned(ctxMenu.icon.id)
                  ? `Unpinned “${ctxMenu.icon.name}”`
                  : `Pinned “${ctxMenu.icon.name}”`,
              );
              setCtxMenu(null);
            }}
          >
            {isPinned(ctxMenu.icon.id) ? (
              <>
                <PinOff size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                Unpin
              </>
            ) : (
              <>
                <Pin size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                Pin to top
              </>
            )}
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
              onClick={() => {
                removeUserIcon(ctxMenu.icon.id);
                showToast(`Deleted “${ctxMenu.icon.name}”`);
                setCtxMenu(null);
              }}
            >
              <Trash2 size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
              Delete
            </button>
          ) : null}
        </ContextMenu>
      )}
    </aside>
  );
}
