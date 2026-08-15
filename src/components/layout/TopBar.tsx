/**
 * Full-width app chrome (above rail + side panels + canvas).
 * Left-aligned: logo · docs/name · size · New/Open/Save/Export · Theme/Opacity/Hue
 * Wraps to a second full-width row when the window is narrow.
 */
import {
  ChevronDown,
  Download,
  FilePlus2,
  FolderOpen,
  Save,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { exportJSON } from '../../lib/canvasController';
import {
  closeDocument,
  openDocumentFromFile,
  snapshotActiveDocument,
  switchToDocument,
} from '../../lib/documentManager';
import { downloadText } from '../../lib/export';
import { useAppStore } from '../../store/appStore';
import { NewDocumentDialog } from './NewDocumentDialog';

export function TopBar() {
  const projectName = useAppStore((s) => s.projectName);
  const setProjectName = useAppStore((s) => s.setProjectName);
  const setExportOpen = useAppStore((s) => s.setExportOpen);
  const showToast = useAppStore((s) => s.showToast);
  const artboardWidth = useAppStore((s) => s.artboardWidth);
  const artboardHeight = useAppStore((s) => s.artboardHeight);
  const glassOpacity = useAppStore((s) => s.glassOpacity);
  const setGlassOpacity = useAppStore((s) => s.setGlassOpacity);
  const glassHue = useAppStore((s) => s.glassHue);
  const setGlassHue = useAppStore((s) => s.setGlassHue);
  const themeMode = useAppStore((s) => s.themeMode);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  const openDocuments = useAppStore((s) => s.openDocuments);
  const activeDocumentId = useAppStore((s) => s.activeDocumentId);

  const [newOpen, setNewOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [docsMenuPos, setDocsMenuPos] = useState<{ top: number; left: number } | null>(null);
  const docsBtnRef = useRef<HTMLButtonElement>(null);
  const docsMenuRef = useRef<HTMLDivElement>(null);

  const closeDocs = useCallback(() => {
    setDocsOpen(false);
    setDocsMenuPos(null);
  }, []);

  const updateDocsMenuPos = useCallback(() => {
    const btn = docsBtnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const menuW = 260;
    let left = r.left;
    if (left + menuW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - menuW - 8);
    setDocsMenuPos({ top: r.bottom + 6, left });
  }, []);

  useLayoutEffect(() => {
    if (!docsOpen) {
      setDocsMenuPos(null);
      return;
    }
    updateDocsMenuPos();
    window.addEventListener('resize', updateDocsMenuPos);
    window.addEventListener('scroll', updateDocsMenuPos, true);
    return () => {
      window.removeEventListener('resize', updateDocsMenuPos);
      window.removeEventListener('scroll', updateDocsMenuPos, true);
    };
  }, [docsOpen, updateDocsMenuPos]);

  useEffect(() => {
    if (!docsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDocs();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('ba-popover-blocking');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('ba-popover-blocking');
    };
  }, [docsOpen, closeDocs]);

  const onSave = () => {
    snapshotActiveDocument();
    const data = exportJSON();
    if (!data) return;
    const payload = {
      ...data,
      projectName,
      savedAt: new Date().toISOString(),
    };
    downloadText(
      `${projectName.replace(/[^\w\-]+/g, '_') || 'figure'}.ba`,
      JSON.stringify(payload, null, 2),
      'application/json',
    );
    showToast('Project saved');
  };

  const onOpen = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ba,.bioartist,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const doc = await openDocumentFromFile(data);
        if (doc) {
          showToast(`Opened “${doc.name}” as a new tab`);
        } else {
          showToast('Could not open project file');
        }
      } catch {
        showToast('Could not open project file');
      }
    };
    input.click();
  };

  return (
    <header className="ba-topbar">
      <div className="ba-topbar-strip">
        <div className="ba-logo" title="BioArtist">
          <div className="ba-logo-mark" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="white" strokeWidth="1.5" />
              <circle cx="7" cy="7" r="2" fill="white" />
            </svg>
          </div>
          <span className="ba-logo-text">BioArtist</span>
        </div>

        <div className="ba-docs-picker">
          <button
            ref={docsBtnRef}
            type="button"
            className="ba-docs-picker-btn"
            title="Open figures"
            aria-haspopup="listbox"
            aria-expanded={docsOpen}
            onClick={() => setDocsOpen((v) => !v)}
          >
            <ChevronDown size={14} />
            <span className="ba-docs-picker-count">{openDocuments.length}</span>
          </button>
          {docsOpen &&
            docsMenuPos &&
            createPortal(
              <>
                <div
                  className="ba-popover-scrim"
                  aria-hidden
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    closeDocs();
                  }}
                />
                <div
                  ref={docsMenuRef}
                  className="ba-docs-menu ba-docs-menu--portal"
                  role="listbox"
                  aria-label="Open figures"
                  style={{ top: docsMenuPos.top, left: docsMenuPos.left }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="ba-docs-menu-head">Open figures</div>
                  {openDocuments.map((d) => (
                    <div
                      key={d.id}
                      className={`ba-docs-menu-item ${d.id === activeDocumentId ? 'active' : ''}`}
                    >
                      <button
                        type="button"
                        className="ba-docs-menu-select"
                        role="option"
                        aria-selected={d.id === activeDocumentId}
                        onClick={() => {
                          void switchToDocument(d.id).then((ok) => {
                            if (ok) showToast(`Switched to “${d.name}”`);
                            closeDocs();
                          });
                        }}
                      >
                        <span className="ba-docs-menu-name">{d.name}</span>
                        <span className="ba-docs-menu-size">
                          {d.artboardWidth}×{d.artboardHeight}
                        </span>
                      </button>
                      {openDocuments.length > 1 && (
                        <button
                          type="button"
                          className="ba-docs-menu-close"
                          title="Close figure"
                          aria-label={`Close ${d.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void closeDocument(d.id).then((ok) => {
                              if (ok) showToast('Figure closed');
                              else showToast('Cannot close the last figure');
                            });
                          }}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="ba-docs-menu-new"
                    onClick={() => {
                      closeDocs();
                      setNewOpen(true);
                    }}
                  >
                    <FilePlus2 size={14} /> New blank canvas…
                  </button>
                </div>
              </>,
              document.body,
            )}
          <input
            className="ba-project-name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            title="Figure name"
            aria-label="Figure name"
          />
        </div>

        <span className="ba-topbar-size-chip" title="Current canvas size">
          {artboardWidth}×{artboardHeight}
        </span>

        <div className="ba-topbar-group ba-topbar-file-actions">
          <button
            className="ba-btn"
            title="New blank canvas (does not close open figures)"
            onClick={() => setNewOpen(true)}
          >
            <FilePlus2 size={15} />
            <span className="ba-topbar-label">New</span>
          </button>
          <button className="ba-btn" title="Open project as a new tab" onClick={onOpen}>
            <FolderOpen size={15} />
            <span className="ba-topbar-label">Open</span>
          </button>
          <button className="ba-btn" title="Save project (⌘S)" onClick={onSave}>
            <Save size={15} />
            <span className="ba-topbar-label">Save</span>
          </button>
          <button className="ba-btn" title="Export (⌘E)" onClick={() => setExportOpen(true)}>
            <Download size={15} />
            <span className="ba-topbar-label">Export</span>
          </button>
        </div>

        <div className="ba-glass-controls" title="Liquid glass theme">
          <div className="ba-theme-toggle" role="group" aria-label="App theme">
            <button
              type="button"
              className={`ba-theme-toggle-btn ${themeMode === 'light' ? 'active' : ''}`}
              onClick={() => setThemeMode('light')}
              title="Light frosted glass"
            >
              Light
            </button>
            <button
              type="button"
              className={`ba-theme-toggle-btn ${themeMode === 'dark' ? 'active' : ''}`}
              onClick={() => setThemeMode('dark')}
              title="Dark liquid glass"
            >
              Dark
            </button>
          </div>
          <div className="ba-glass-control-divider" aria-hidden />
          <label className="ba-glass-slider">
            <span className="ba-glass-slider-head">
              <span>Opacity</span>
              <span>{Math.round(glassOpacity * 100)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={glassOpacity}
              onChange={(e) => setGlassOpacity(Number(e.target.value))}
              aria-label="Glass opacity 0 to 100 percent"
            />
          </label>
          <div className="ba-glass-control-divider" aria-hidden />
          <label className="ba-glass-slider">
            <span className="ba-glass-slider-head">
              <span>Hue</span>
              <span>{glassHue}°</span>
            </span>
            <input
              type="range"
              className="ba-glass-hue"
              min={0}
              max={359}
              step={1}
              value={glassHue}
              onChange={(e) => setGlassHue(Number(e.target.value))}
              aria-label="Glass hue tint"
            />
          </label>
        </div>
      </div>

      <NewDocumentDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </header>
  );
}
