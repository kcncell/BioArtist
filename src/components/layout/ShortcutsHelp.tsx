import { useAppStore } from '../../store/appStore';

const ROWS: [string, string][] = [
  ['V', 'Icon library'],
  ['C', 'Chem draw (RDKit)'],
  ['A', 'AI import (MCP)'],
  ['M', 'Templates'],
  ['P', 'PDB / UniProt'],
  ['S', 'Shapes palette'],
  ['L', 'Lines & arrows'],
  ['T', 'Add text'],
  ['Delete', 'Delete selection'],
  ['⌘/Ctrl + Z', 'Undo'],
  ['⌘/Ctrl + ⇧ + Z', 'Redo'],
  ['⌘/Ctrl + D', 'Copy selection'],
  ['⌘/Ctrl + G', 'Group'],
  ['⌘/Ctrl + ⇧ + G', 'Ungroup'],
  ['⌘/Ctrl + S', 'Save project'],
  ['⌘/Ctrl + E', 'Export'],
  ['Space + drag', 'Pan canvas'],
  ['⌘/Ctrl + scroll', 'Zoom'],
  ['⌘/Ctrl + C / X / V', 'Copy / cut / paste objects (or SVG · SMILES · image)'],
  ['Right-click canvas', 'Context menu — paste, layers, favorites, SVG…'],
  ['?', 'This help'],
];

export function ShortcutsHelp() {
  const open = useAppStore((s) => s.helpOpen);
  const setHelpOpen = useAppStore((s) => s.setHelpOpen);
  if (!open) return null;

  return (
    <div className="ba-modal-backdrop" onClick={() => setHelpOpen(false)}>
      <div className="ba-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 92vw)' }}>
        <h3>Keyboard shortcuts</h3>
        <p>BioArtist works like a scientific figure editor — learn these once.</p>
        <dl className="ba-help-grid">
          {ROWS.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="ba-modal-actions">
          <button className="ba-btn ba-btn-primary" onClick={() => setHelpOpen(false)}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
