import { useAppStore } from '../../store/appStore';

function formatTime(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function StatusBar() {
  const zoom = useAppStore((s) => s.zoom);
  const selectionCount = useAppStore((s) => s.selectionCount);
  const layers = useAppStore((s) => s.layers);
  const artboardWidth = useAppStore((s) => s.artboardWidth);
  const artboardHeight = useAppStore((s) => s.artboardHeight);
  const userLibrary = useAppStore((s) => s.userLibrary);
  const autosaveStatus = useAppStore((s) => s.autosaveStatus);
  const openDocuments = useAppStore((s) => s.openDocuments);
  const activeDocumentId = useAppStore((s) => s.activeDocumentId);
  const active = openDocuments.find((d) => d.id === activeDocumentId);
  const dirty = !!active?.dirty;

  let saveLabel = 'Draft only';
  if (autosaveStatus.message) {
    saveLabel = autosaveStatus.message;
  } else if (autosaveStatus.fileName && autosaveStatus.diskAt) {
    saveLabel = `Saved ${autosaveStatus.fileName} · ${formatTime(autosaveStatus.diskAt)}`;
  } else if (autosaveStatus.fileName) {
    saveLabel = dirty
      ? `Linked ${autosaveStatus.fileName} · unsaved changes`
      : `Linked ${autosaveStatus.fileName}`;
  } else if (autosaveStatus.draftAt) {
    saveLabel = `Local draft · ${formatTime(autosaveStatus.draftAt)}`;
  }

  return (
    <footer className="ba-statusbar">
      <span>Zoom {Math.round(zoom * 100)}%</span>
      <span>
        Canvas {artboardWidth} × {artboardHeight}
      </span>
      <span>
        {selectionCount === 0
          ? 'No selection'
          : selectionCount === 1
            ? '1 object selected'
            : `${selectionCount} objects selected`}
      </span>
      <span>{layers.length} layers</span>
      <span title="Autosave status" className={dirty ? 'ba-statusbar-unsaved' : undefined}>
        {dirty ? '• ' : ''}
        {saveLabel}
      </span>
      <span style={{ marginLeft: 'auto' }}>
        My Library: {userLibrary.length} import{userLibrary.length === 1 ? '' : 's'}
      </span>
    </footer>
  );
}
