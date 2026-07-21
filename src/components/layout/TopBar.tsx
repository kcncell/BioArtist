import {
  CircleHelp,
  Columns3,
  Download,
  FolderOpen,
  Grid3x3,
  Group,
  Redo2,
  Save,
  Undo2,
  Ungroup,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  bringForward,
  duplicateSelection,
  exportJSON,
  fitToScreen,
  groupSelection,
  importJSON,
  redo,
  sendBackward,
  setArtboardSize as setCanvasArtboard,
  setSnap,
  undo,
  ungroupSelection,
  zoomBy,
} from '../../lib/canvasController';
import { downloadText } from '../../lib/export';
import { useAppStore } from '../../store/appStore';

const ARTBOARDS = [
  { id: 'slide', label: 'Slide 16:9', w: 960, h: 540 },
  { id: 'figure', label: 'Figure', w: 900, h: 600 },
  { id: 'square', label: 'Square', w: 800, h: 800 },
  { id: 'poster', label: 'Poster', w: 1200, h: 800 },
];

export function TopBar() {
  const projectName = useAppStore((s) => s.projectName);
  const setProjectName = useAppStore((s) => s.setProjectName);
  const canUndo = useAppStore((s) => s.canUndo);
  const canRedo = useAppStore((s) => s.canRedo);
  const zoom = useAppStore((s) => s.zoom);
  const setExportOpen = useAppStore((s) => s.setExportOpen);
  const setHelpOpen = useAppStore((s) => s.setHelpOpen);
  const showToast = useAppStore((s) => s.showToast);
  const artboardWidth = useAppStore((s) => s.artboardWidth);
  const artboardHeight = useAppStore((s) => s.artboardHeight);
  const setArtboardSize = useAppStore((s) => s.setArtboardSize);
  const showGrid = useAppStore((s) => s.showGrid);
  const setShowGrid = useAppStore((s) => s.setShowGrid);
  const snapOn = useAppStore((s) => s.snapOn);
  const setSnapOn = useAppStore((s) => s.setSnapOn);
  const columnGuides = useAppStore((s) => s.columnGuides);
  const setColumnGuides = useAppStore((s) => s.setColumnGuides);
  const glassOpacity = useAppStore((s) => s.glassOpacity);
  const setGlassOpacity = useAppStore((s) => s.setGlassOpacity);
  const glassHue = useAppStore((s) => s.glassHue);
  const setGlassHue = useAppStore((s) => s.setGlassHue);
  const themeMode = useAppStore((s) => s.themeMode);
  const setThemeMode = useAppStore((s) => s.setThemeMode);

  const onSave = () => {
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
        if (data.projectName) setProjectName(data.projectName);
        if (data.artboard) {
          setArtboardSize(data.artboard.width, data.artboard.height);
        }
        await importJSON(data);
        showToast('Project loaded');
      } catch {
        showToast('Could not open project file');
      }
    };
    input.click();
  };

  const artboardValue =
    ARTBOARDS.find((a) => a.w === artboardWidth && a.h === artboardHeight)?.id || 'custom';

  return (
    <header className="ba-topbar">
      <div className="ba-logo" title="BioArtist">
        <div className="ba-logo-mark" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="white" strokeWidth="1.5" />
            <circle cx="7" cy="7" r="2" fill="white" />
          </svg>
        </div>
        <span className="ba-logo-text">BioArtist</span>
      </div>

      <input
        className="ba-project-name"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        title="Project name"
      />

      <select
        className="ba-artboard-select"
        title="Artboard size"
        value={artboardValue}
        onChange={(e) => {
          const preset = ARTBOARDS.find((a) => a.id === e.target.value);
          if (!preset) return;
          setArtboardSize(preset.w, preset.h);
          setCanvasArtboard(preset.w, preset.h);
          showToast(`Artboard ${preset.w}×${preset.h}`);
        }}
      >
        {ARTBOARDS.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
        {artboardValue === 'custom' && (
          <option value="custom">
            Custom {artboardWidth}×{artboardHeight}
          </option>
        )}
      </select>

      <div className="ba-topbar-group" title="Grid & snap">
        <button
          className={`ba-btn ba-btn-icon ${showGrid ? 'active' : ''}`}
          title="Show or hide grid"
          onClick={() => {
            setShowGrid(!showGrid);
            showToast(showGrid ? 'Grid hidden' : 'Grid shown');
          }}
        >
          <Grid3x3 size={15} />
        </button>
        <button
          className={`ba-btn ba-btn-sm ${snapOn ? 'active' : ''}`}
          title="Smart alignment guides"
          onClick={() => {
            const next = !snapOn;
            setSnapOn(next);
            setSnap(next);
            showToast(next ? 'Alignment guides on' : 'Alignment guides off');
          }}
        >
          Snap
        </button>
        <label className="ba-guides-columns" title="Column guides">
          <Columns3 size={14} />
          <select
            className="ba-artboard-select"
            value={columnGuides}
            onChange={(e) => {
              const n = Number(e.target.value);
              setColumnGuides(n);
              showToast(n === 0 ? 'Column guides off' : `${n} vertical columns`);
            }}
          >
            <option value={0}>Cols</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={5}>5</option>
            <option value={6}>6</option>
          </select>
        </label>
      </div>

      <div className="ba-topbar-group">
        <button className="ba-btn ba-btn-icon" title="Undo (⌘Z)" disabled={!canUndo} onClick={() => undo()}>
          <Undo2 size={16} />
        </button>
        <button className="ba-btn ba-btn-icon" title="Redo (⌘⇧Z)" disabled={!canRedo} onClick={() => redo()}>
          <Redo2 size={16} />
        </button>
      </div>

      <div className="ba-topbar-group">
        <button className="ba-btn ba-btn-icon" title="Zoom out" onClick={() => zoomBy(-0.1)}>
          <ZoomOut size={16} />
        </button>
        <button
          className="ba-btn ba-btn-sm"
          title="Fit artboard to window"
          onClick={() => {
            fitToScreen();
            window.dispatchEvent(new Event('resize'));
            showToast('Fitted to window');
          }}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button className="ba-btn ba-btn-icon" title="Zoom in" onClick={() => zoomBy(0.1)}>
          <ZoomIn size={16} />
        </button>
      </div>

      <div className="ba-topbar-group">
        <button className="ba-btn ba-btn-icon" title="Group (⌘G)" onClick={() => groupSelection()}>
          <Group size={16} />
        </button>
        <button className="ba-btn ba-btn-icon" title="Ungroup" onClick={() => ungroupSelection()}>
          <Ungroup size={16} />
        </button>
        <button className="ba-btn ba-btn-sm" title="Bring forward" onClick={() => bringForward()}>
          Fwd
        </button>
        <button className="ba-btn ba-btn-sm" title="Send backward" onClick={() => sendBackward()}>
          Back
        </button>
        <button className="ba-btn ba-btn-sm" title="Copy selection (⌘D)" onClick={() => duplicateSelection()}>
          Copy
        </button>
      </div>

      <div className="ba-topbar-spacer" aria-hidden />

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
            max={0.5}
            step={0.01}
            value={glassOpacity}
            onChange={(e) => setGlassOpacity(Number(e.target.value))}
            aria-label="Glass opacity 0 to 50 percent"
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

      <div className="ba-topbar-group">
        <button className="ba-btn ba-btn-icon" title="Shortcuts (?)" onClick={() => setHelpOpen(true)}>
          <CircleHelp size={16} />
        </button>
        <button className="ba-btn" title="Open project" onClick={onOpen}>
          <FolderOpen size={15} />
          <span className="ba-topbar-label">Open</span>
        </button>
        <button className="ba-btn" title="Save project (⌘S)" onClick={onSave}>
          <Save size={15} />
          <span className="ba-topbar-label">Save</span>
        </button>
        <button className="ba-btn ba-btn-primary" title="Export (⌘E)" onClick={() => setExportOpen(true)}>
          <Download size={15} />
          <span className="ba-topbar-label">Export</span>
        </button>
      </div>
    </header>
  );
}
