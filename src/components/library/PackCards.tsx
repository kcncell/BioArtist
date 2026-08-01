import {
  ExternalLink,
  FolderOpen,
  ImagePlus,
  Loader2,
  Package,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { loadMcpInboxIcons } from '../../lib/mcpInbox';
import {
  installBioiconsPack,
  installFolderAsPack,
  removeInstalledPack,
  type PackId,
  type PackManifest,
} from '../../lib/packs';
import { readSvgFiles } from '../../lib/svgImport';
import { useAppStore } from '../../store/appStore';
import {
  EXTERNAL_ART_SOURCES,
  ExternalArtDialog,
  openExternalArtTarget,
  type ExternalArtSourceKey,
  type ExternalArtTarget,
} from './ExternalArtDialog';

interface Props {
  bioicons: PackManifest | null;
  nih: PackManifest | null;
  activeShelf: 'imports' | 'bioicons' | 'nih';
  onShelfChange: (s: 'imports' | 'bioicons' | 'nih') => void;
  onPacksChanged: () => void;
  onMcpSynced?: () => void;
}

export function PackCards({
  bioicons,
  nih,
  activeShelf,
  onShelfChange,
  onPacksChanged,
  onMcpSynced,
}: Props) {
  const showToast = useAppStore((s) => s.showToast);
  const addUserIcons = useAppStore((s) => s.addUserIcons);
  const [busy, setBusy] = useState<string | null>(null);
  const [bioVariant, setBioVariant] = useState<'cc0' | 'full'>('full');
  const [pendingExternal, setPendingExternal] = useState<ExternalArtTarget | null>(null);
  const nihFolderRef = useRef<HTMLInputElement>(null);
  const servierFileRef = useRef<HTMLInputElement>(null);

  /** Same license dialog for Bioicons, NIH, Servier, and AI tools. */
  const requestOpenExternal = (key: ExternalArtSourceKey) => {
    setPendingExternal(EXTERNAL_ART_SOURCES[key]);
  };

  const approveExternal = (target: ExternalArtTarget) => {
    setPendingExternal(null);
    openExternalArtTarget(target);
    showToast(`Opened ${target.title} — download or copy art, then import or paste here`);
  };

  const dialog = (
    <ExternalArtDialog
      target={pendingExternal}
      onCancel={() => setPendingExternal(null)}
      onApprove={approveExternal}
    />
  );

  /** Hide full pack cards while browsing so the icon grid is visible. */
  if (activeShelf === 'bioicons' && bioicons) {
    return (
      <>
        <div className="ba-pack-browse-bar">
          <button className="ba-btn ba-btn-sm" type="button" onClick={() => onShelfChange('imports')}>
            ← Packs
          </button>
          <strong>Bioicons</strong>
          <span className="ba-pack-meta" style={{ margin: 0 }}>
            {bioicons.counts.total.toLocaleString()} icons
          </span>
          <button
            type="button"
            className="ba-btn ba-btn-sm"
            onClick={() => requestOpenExternal('bioicons')}
            title="Open bioicons.com"
          >
            <ExternalLink size={13} /> Website
          </button>
        </div>
        {dialog}
      </>
    );
  }

  if (activeShelf === 'nih' && nih) {
    return (
      <>
        <div className="ba-pack-browse-bar">
          <button className="ba-btn ba-btn-sm" type="button" onClick={() => onShelfChange('imports')}>
            ← Packs
          </button>
          <strong>NIH BioArt</strong>
          <span className="ba-pack-meta" style={{ margin: 0 }}>
            {nih.counts.total.toLocaleString()} icons
          </span>
          <button
            type="button"
            className="ba-btn ba-btn-sm"
            onClick={() => requestOpenExternal('nih')}
          >
            <ExternalLink size={13} /> Website
          </button>
        </div>
        {dialog}
      </>
    );
  }

  const syncMcp = async () => {
    setBusy('mcp');
    try {
      const icons = await loadMcpInboxIcons();
      if (!icons.length) {
        showToast('MCP inbox empty — run bioartist-mcp or check public/mcp-inbox/');
        return;
      }
      const ok = await addUserIcons(icons);
      if (ok) {
        showToast(`Synced ${icons.length} icon${icons.length > 1 ? 's' : ''} from MCP inbox`);
        onShelfChange('imports');
        onMcpSynced?.();
      }
    } catch (e) {
      console.error(e);
      showToast('Could not read MCP inbox');
    } finally {
      setBusy(null);
    }
  };

  const installBio = async () => {
    setBusy('bioicons');
    try {
      const m = await installBioiconsPack(bioVariant);
      showToast(
        `Bioicons ready — ${m.counts.total.toLocaleString()} icons (${bioVariant === 'cc0' ? 'CC0 only' : 'all licenses'})`,
      );
      onPacksChanged();
      onShelfChange('bioicons');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Bioicons install failed');
    } finally {
      setBusy(null);
    }
  };

  const removePack = async (pack: PackId) => {
    setBusy(pack);
    try {
      await removeInstalledPack(pack);
      showToast(pack === 'bioicons' ? 'Bioicons pack removed' : 'NIH pack removed');
      onPacksChanged();
      onShelfChange('imports');
    } finally {
      setBusy(null);
    }
  };

  const importNihFolder = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy('nih');
    try {
      const m = await installFolderAsPack('nih', files, {
        title: 'NIH BioArt (local folder)',
        homepage: 'https://bioart.niaid.nih.gov/',
        credit:
          'Illustrations from NIAID NIH BioArt Source (https://bioart.niaid.nih.gov/). Check each entry for attribution requirements. Free for research, educational, and commercial use per NIH terms.',
      });
      showToast(`NIH folder imported — ${m.counts.total} SVGs`);
      onPacksChanged();
      onShelfChange('nih');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'NIH folder import failed');
    } finally {
      setBusy(null);
    }
  };

  /** Servier / general download → My Library (not a separate pack shelf). */
  const importServierFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy('servier');
    try {
      const list = Array.from(files);
      const svgFiles = list.filter(
        (f) => f.name.toLowerCase().endsWith('.svg') || f.type === 'image/svg+xml',
      );
      const rasterFiles = list.filter((f) =>
        /^image\/(png|jpeg|jpg|webp|gif)$/i.test(f.type) ||
        /\.(png|jpe?g|webp|gif)$/i.test(f.name),
      );

      let n = 0;
      if (svgFiles.length) {
        const icons = await readSvgFiles(svgFiles);
        if (icons.length) {
          await addUserIcons(icons);
          n += icons.length;
        }
      }
      for (const file of rasterFiles) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(r.error);
          r.readAsDataURL(file);
        });
        const base = file.name.replace(/\.[^.]+$/, '');
        await addUserIcons([
          {
            id: `user/servier-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: base.replace(/[_-]+/g, ' '),
            category: 'symbols',
            path: dataUrl,
            source: 'user',
            author: 'Servier Medical Art (imported)',
            licenseLabel: 'CC BY 4.0 — credit required',
            attributionRequired: true,
          },
        ]);
        n += 1;
      }

      if (!n) {
        showToast('No SVG or image files found');
        return;
      }
      onShelfChange('imports');
      showToast(
        `Imported ${n} file${n === 1 ? '' : 's'} to My Library — credit Servier (CC BY 4.0) if from SMART`,
      );
    } catch (e) {
      console.error(e);
      showToast('Import failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ba-pack-cards">
      {/* MCP — always visible at top of My Library packs */}
      <div className="ba-pack-card ba-mcp-card">
        <div className="ba-pack-card-head">
          <Sparkles size={18} color="var(--ba-accent)" />
          <div>
            <strong>MCP inbox</strong>
            <span>Desktop AI SVGs → My Library</span>
          </div>
        </div>
        <p className="ba-pack-meta">
          After <code>bioartist-mcp</code> writes icons to <code>public/mcp-inbox/</code>, sync them
          here in one click (same idea as Bioicons pack).
        </p>
        <div className="ba-pack-actions">
          <button
            className="ba-btn ba-btn-primary ba-btn-sm"
            disabled={busy === 'mcp'}
            onClick={() => void syncMcp()}
          >
            {busy === 'mcp' ? (
              <>
                <Loader2 size={14} className="ba-spin" /> Syncing…
              </>
            ) : (
              <>
                <Sparkles size={14} /> Sync MCP inbox
              </>
            )}
          </button>
        </div>
      </div>

      {/* Bioicons */}
      <div className={`ba-pack-card ${activeShelf === 'bioicons' && bioicons ? 'active' : ''}`}>
        <div className="ba-pack-card-head">
          <Package size={18} color="var(--ba-accent)" />
          <div>
            <strong>Bioicons</strong>
            <span>Open science SVGs · license per icon</span>
          </div>
        </div>

        {bioicons ? (
          <>
            <p className="ba-pack-meta">
              {bioicons.counts.total.toLocaleString()} icons installed
              {bioicons.variant ? ` · ${bioicons.variant}` : ''}
              {' · '}
              catalog in browser storage; SVGs load from CDN when placed
            </p>
            <div className="ba-pack-actions">
              <button
                className="ba-btn ba-btn-primary ba-btn-sm"
                type="button"
                onClick={() => {
                  onShelfChange('bioicons');
                  showToast(
                    `Browsing Bioicons — ${bioicons.counts.total.toLocaleString()} icons below. Website: bioicons.com`,
                  );
                }}
              >
                Browse pack
              </button>
              <button
                className="ba-btn ba-btn-sm"
                disabled={busy === 'bioicons'}
                onClick={() => void installBio()}
                title="Re-download catalog"
              >
                Update
              </button>
              <button
                type="button"
                className="ba-btn ba-btn-sm"
                onClick={() => requestOpenExternal('bioicons')}
                title="Open bioicons.com"
              >
                <ExternalLink size={13} /> Website
              </button>
              <button
                className="ba-btn ba-btn-icon"
                title="Remove pack"
                disabled={!!busy}
                onClick={() => void removePack('bioicons')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="ba-pack-meta">
              One-click catalog from GitHub (icons load from CDN when you place them). Respect each
              icon&apos;s license.
            </p>
            <label className="ba-pack-option">
              <input
                type="radio"
                name="bio-variant"
                checked={bioVariant === 'full'}
                onChange={() => setBioVariant('full')}
              />
              Full library (~2.5k, mixed licenses)
            </label>
            <label className="ba-pack-option">
              <input
                type="radio"
                name="bio-variant"
                checked={bioVariant === 'cc0'}
                onChange={() => setBioVariant('cc0')}
              />
              CC0 only (~330, no attribution required)
            </label>
            <div className="ba-pack-actions">
              <button
                className="ba-btn ba-btn-primary ba-btn-sm"
                disabled={busy === 'bioicons'}
                onClick={() => void installBio()}
              >
                {busy === 'bioicons' ? (
                  <>
                    <Loader2 size={14} className="ba-spin" /> Installing…
                  </>
                ) : (
                  'Add Bioicons pack'
                )}
              </button>
              <button
                type="button"
                className="ba-btn ba-btn-sm"
                onClick={() => requestOpenExternal('bioicons')}
              >
                <ExternalLink size={13} /> Site
              </button>
            </div>
          </>
        )}
      </div>

      {/* NIH BioArt */}
      <div className={`ba-pack-card ${activeShelf === 'nih' && nih ? 'active' : ''}`}>
        <div className="ba-pack-card-head">
          <Package size={18} color="#1d4ed8" />
          <div>
            <strong>NIH BioArt</strong>
            <span>NIAID free science illustrations</span>
          </div>
        </div>

        {nih ? (
          <>
            <p className="ba-pack-meta">
              {nih.counts.total.toLocaleString()} SVGs from your folder
            </p>
            <div className="ba-pack-actions">
              <button
                className="ba-btn ba-btn-primary ba-btn-sm"
                type="button"
                onClick={() => {
                  onShelfChange('nih');
                  showToast(`Browsing NIH BioArt — ${nih.counts.total.toLocaleString()} icons below`);
                }}
              >
                Browse pack
              </button>
              <button
                className="ba-btn ba-btn-sm"
                disabled={!!busy}
                onClick={() => nihFolderRef.current?.click()}
              >
                Replace folder
              </button>
              <button
                type="button"
                className="ba-btn ba-btn-sm"
                onClick={() => requestOpenExternal('nih')}
              >
                <ExternalLink size={13} /> Website
              </button>
              <button
                className="ba-btn ba-btn-icon"
                title="Remove pack"
                disabled={!!busy}
                onClick={() => void removePack('nih')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="ba-pack-meta">
              Free for research &amp; commercial use (check entry attribution). Download SVGs from
              NIH, then import the folder here — seamless browse like MCP.
            </p>
            <div className="ba-pack-actions">
              <button
                type="button"
                className="ba-btn ba-btn-primary ba-btn-sm"
                onClick={() => requestOpenExternal('nih')}
              >
                <ExternalLink size={13} /> Open NIH BioArt
              </button>
              <button
                className="ba-btn ba-btn-sm"
                disabled={busy === 'nih'}
                onClick={() => nihFolderRef.current?.click()}
              >
                {busy === 'nih' ? (
                  <>
                    <Loader2 size={14} className="ba-spin" /> Importing…
                  </>
                ) : (
                  <>
                    <FolderOpen size={14} /> Import downloads
                  </>
                )}
              </button>
            </div>
          </>
        )}

        <input
          ref={(el) => {
            nihFolderRef.current = el;
            if (el) {
              el.setAttribute('webkitdirectory', '');
              el.setAttribute('directory', '');
            }
          }}
          type="file"
          multiple
          accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          hidden
          onChange={(e) => {
            void importNihFolder(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Servier Medical Art */}
      <div className="ba-pack-card">
        <div className="ba-pack-card-head">
          <Package size={18} color="#0d9488" />
          <div>
            <strong>Servier Medical Art</strong>
            <span>3,000+ free medical illustrations · CC BY 4.0</span>
          </div>
        </div>
        <p className="ba-pack-meta">
          Professional medical art from{' '}
          <button
            type="button"
            className="ba-link-btn"
            onClick={() => requestOpenExternal('servier')}
          >
            smart.servier.com
          </button>
          . Download what you need, then import here or paste onto the canvas. Attribution
          required.
        </p>
        <div className="ba-pack-actions">
          <button
            type="button"
            className="ba-btn ba-btn-primary ba-btn-sm"
            onClick={() => requestOpenExternal('servier')}
          >
            <ExternalLink size={13} /> Open Servier SMART
          </button>
          <button
            type="button"
            className="ba-btn ba-btn-sm"
            disabled={busy === 'servier'}
            onClick={() => servierFileRef.current?.click()}
          >
            {busy === 'servier' ? (
              <>
                <Loader2 size={14} className="ba-spin" /> Importing…
              </>
            ) : (
              <>
                <FolderOpen size={14} /> Import downloads
              </>
            )}
          </button>
        </div>
        <input
          ref={servierFileRef}
          type="file"
          multiple
          accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          hidden
          onChange={(e) => {
            void importServierFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* AI image tools — A–Z buttons; caution + prompts in dialog */}
      <div className="ba-pack-card ba-pack-card--ai">
        <div className="ba-pack-card-head">
          <ImagePlus size={18} color="var(--ba-accent)" />
          <div>
            <strong>AI image tools</strong>
            <span>Simple lab icons · not anatomy</span>
          </div>
        </div>
        <p className="ba-pack-meta">
          Opens ChatGPT, Claude, Gemini, or Grok in a new tab (your login). Best for basic icons
          (pipette, plate, plate reader). AI can make mistakes — for professional medical art use
          Bioicons / NIH / Servier. Generate → download or copy → <strong>Import</strong> or{' '}
          <kbd>⌘V</kbd>. Example prompts appear after you click a tool.
        </p>
        <div className="ba-pack-actions">
          <button
            type="button"
            className="ba-btn ba-btn-sm"
            onClick={() => requestOpenExternal('chatgpt')}
          >
            <ExternalLink size={13} /> ChatGPT
          </button>
          <button
            type="button"
            className="ba-btn ba-btn-sm"
            onClick={() => requestOpenExternal('claude')}
          >
            <ExternalLink size={13} /> Claude
          </button>
          <button
            type="button"
            className="ba-btn ba-btn-sm"
            onClick={() => requestOpenExternal('gemini')}
          >
            <ExternalLink size={13} /> Gemini
          </button>
          <button
            type="button"
            className="ba-btn ba-btn-sm"
            onClick={() => requestOpenExternal('grok')}
          >
            <ExternalLink size={13} /> Grok
          </button>
        </div>
      </div>

      {(bioicons || nih) && (
        <div className="ba-shelf-tabs">
          <button
            className={`ba-chip ${activeShelf === 'imports' ? 'active' : ''}`}
            onClick={() => onShelfChange('imports')}
          >
            My imports
          </button>
          {bioicons && (
            <button
              className={`ba-chip ${activeShelf === 'bioicons' ? 'active' : ''}`}
              onClick={() => onShelfChange('bioicons')}
            >
              Bioicons ({bioicons.counts.total})
            </button>
          )}
          {nih && (
            <button
              className={`ba-chip ${activeShelf === 'nih' ? 'active' : ''}`}
              onClick={() => onShelfChange('nih')}
            >
              NIH ({nih.counts.total})
            </button>
          )}
        </div>
      )}

      {dialog}
    </div>
  );
}
