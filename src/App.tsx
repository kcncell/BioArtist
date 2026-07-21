import { useEffect } from 'react';
import { FabricCanvas } from './components/canvas/FabricCanvas';
import { ExportDialog } from './components/export/ExportDialog';
import { KeyboardShortcuts } from './components/layout/KeyboardShortcuts';
import { LeftRail } from './components/layout/LeftRail';
import { RightPanel } from './components/layout/RightPanel';
import { ShortcutsHelp } from './components/layout/ShortcutsHelp';
import { StatusBar } from './components/layout/StatusBar';
import { TopBar } from './components/layout/TopBar';
import { LibraryPanel } from './components/library/LibraryPanel';
import { applyGlassTheme } from './lib/glassTheme';
import { useAppStore } from './store/appStore';

export default function App() {
  const toast = useAppStore((s) => s.toast);
  const glassOpacity = useAppStore((s) => s.glassOpacity);
  const glassHue = useAppStore((s) => s.glassHue);
  const themeMode = useAppStore((s) => s.themeMode);

  // Apply frosted glass tokens as soon as the app mounts / values change
  useEffect(() => {
    applyGlassTheme(glassOpacity, glassHue, themeMode);
  }, [glassOpacity, glassHue, themeMode]);

  return (
    <div className="ba-app">
      <TopBar />
      <div className="ba-main">
        <LeftRail />
        <LibraryPanel />
        <FabricCanvas />
        <RightPanel />
      </div>
      <StatusBar />
      <ExportDialog />
      <ShortcutsHelp />
      <KeyboardShortcuts />
      {toast && <div className="ba-toast">{toast}</div>}
    </div>
  );
}
