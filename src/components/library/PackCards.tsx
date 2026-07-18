import { ExternalLink, FolderOpen, Loader2, Package, Sparkles, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { loadMcpInboxIcons } from '../../lib/mcpInbox';
import {
  installBioiconsPack,
  installFolderAsPack,
  removeInstalledPack,
  type PackId,
  type PackManifest,
} from '../../lib/packs';
import { useAppStore } from '../../store/appStore';

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
  const nihFolderRef = useRef<HTMLInputElement>(null);

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
            </p>
            <div className="ba-pack-actions">
              <button
                className="ba-btn ba-btn-primary ba-btn-sm"
                onClick={() => onShelfChange('bioicons')}
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
              <a
                className="ba-btn ba-btn-sm"
                href="https://bioicons.com/"
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={13} /> Site
              </a>
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
              <button className="ba-btn ba-btn-primary ba-btn-sm" onClick={() => onShelfChange('nih')}>
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
              <a
                className="ba-btn ba-btn-primary ba-btn-sm"
                href="https://bioart.niaid.nih.gov/"
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={13} /> Open NIH BioArt
              </a>
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
                    <FolderOpen size={14} /> Import SVG folder
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
          accept=".svg,image/svg+xml"
          hidden
          onChange={(e) => {
            void importNihFolder(e.target.files);
            e.target.value = '';
          }}
        />
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
    </div>
  );
}
