import { useAppStore } from '../../store/appStore';

export function StatusBar() {
  const zoom = useAppStore((s) => s.zoom);
  const selectionCount = useAppStore((s) => s.selectionCount);
  const layers = useAppStore((s) => s.layers);
  const artboardWidth = useAppStore((s) => s.artboardWidth);
  const artboardHeight = useAppStore((s) => s.artboardHeight);
  const userLibrary = useAppStore((s) => s.userLibrary);

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
      <span style={{ marginLeft: 'auto' }}>
        My Library: {userLibrary.length} import{userLibrary.length === 1 ? '' : 's'}
      </span>
    </footer>
  );
}
