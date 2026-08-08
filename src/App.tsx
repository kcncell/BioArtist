import { useEffect, useRef } from 'react';
import { FabricCanvas } from './components/canvas/FabricCanvas';
import { ExportDialog } from './components/export/ExportDialog';
import { KeyboardShortcuts } from './components/layout/KeyboardShortcuts';
import { LeftPanelShell } from './components/layout/LeftPanelShell';
import { LeftRail } from './components/layout/LeftRail';
import { RightPanel } from './components/layout/RightPanel';
import { ShortcutsHelp } from './components/layout/ShortcutsHelp';
import { StatusBar } from './components/layout/StatusBar';
import { TopBar } from './components/layout/TopBar';
import { LibraryPanel } from './components/library/LibraryPanel';
import { addSvgToCanvas } from './lib/canvasController';
import {
  type ChemClipboardPayload,
  type ChemLibraryMsg,
  type ChemStructure,
  consumePendingPlace,
  seedChemClipboardMemory,
  subscribeSendToFigure,
} from './lib/chemLibrary';
import { applyGlassTheme } from './lib/glassTheme';
import { stripOpaqueBackgroundRects } from './lib/rdkit';
import { useAppStore } from './store/appStore';

export default function App() {
  const toast = useAppStore((s) => s.toast);
  const showToast = useAppStore((s) => s.showToast);
  const glassOpacity = useAppStore((s) => s.glassOpacity);
  const glassHue = useAppStore((s) => s.glassHue);
  const themeMode = useAppStore((s) => s.themeMode);
  /** Avoid placing the same Chem Studio send twice (App + ChemPanel). */
  const lastPlacedId = useRef<string | null>(null);

  // Apply frosted glass tokens as soon as the app mounts / values change
  useEffect(() => {
    applyGlassTheme(glassOpacity, glassHue, themeMode);
  }, [glassOpacity, glassHue, themeMode]);

  // Keep Chem Studio → figure clipboard warm across tabs
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel('bioartist-chem');
      ch.onmessage = (ev: MessageEvent<ChemLibraryMsg>) => {
        if (ev.data?.type === 'chem-clipboard' && ev.data.payload) {
          seedChemClipboardMemory(ev.data.payload as ChemClipboardPayload);
        }
      };
    } catch {
      /* ignore */
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'bioartist-chem-clipboard-v1' && e.newValue) {
        try {
          seedChemClipboardMemory(JSON.parse(e.newValue) as ChemClipboardPayload);
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      ch?.close();
    };
  }, []);

  // Always listen for Chem Studio → figure "Add to BioArtist" (not only when Chem panel is open)
  useEffect(() => {
    const place = async (s: ChemStructure) => {
      if (!s?.svg) return;
      // Dedupe rapid double-delivery (BroadcastChannel + pending localStorage)
      const key = `${s.id}:${s.createdAt}:${(s.svg || '').length}`;
      if (lastPlacedId.current === key) return;
      lastPlacedId.current = key;
      try {
        const clean = stripOpaqueBackgroundRects(s.svg);
        await addSvgToCanvas(clean, { name: s.name, maxSize: 200 });
        showToast(`Placed “${s.name}” from Chem Studio`);
      } catch (e) {
        console.error(e);
        showToast('Could not place structure from Chem Studio');
        lastPlacedId.current = null;
      }
    };
    const unsub = subscribeSendToFigure((s) => void place(s));
    const pending = consumePendingPlace();
    if (pending) void place(pending);
    return unsub;
  }, [showToast]);

  const leftPanelOpen = useAppStore((s) => s.leftPanelOpen);
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen);

  return (
    <div className="ba-app">
      <TopBar />
      <div
        className={[
          'ba-main',
          !leftPanelOpen ? 'ba-main-left-collapsed' : '',
          !rightPanelOpen ? 'ba-main-right-collapsed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <LeftRail />
        <LeftPanelShell>
          <LibraryPanel />
        </LeftPanelShell>
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
