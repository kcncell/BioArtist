/**
 * Left panel router: rail tools → specialized panels.
 * My Library / NIH / SMA share SourceLibraryPanel.
 * Bioicons keeps the pack install + category browser.
 */
import { useAppStore } from '../../store/appStore';
import { AiPanel } from './AiPanel';
import { BioiconsPanel } from './BioiconsPanel';
import { ChemPanel } from './ChemPanel';
import { PdbPanel } from './PdbPanel';
import { ShapeLinePanel } from './ShapeLinePanel';
import { SourceLibraryPanel } from './SourceLibraryPanel';
import { TemplatesPanel } from './TemplatesPanel';

export function LibraryPanel() {
  const tool = useAppStore((s) => s.tool);

  if (tool === 'chem') return <ChemPanel />;
  if (tool === 'ai') return <AiPanel />;
  if (tool === 'templates') return <TemplatesPanel />;
  if (tool === 'pdb') return <PdbPanel />;
  if (tool === 'shapes' || tool === 'lines' || tool === 'text') {
    return <ShapeLinePanel />;
  }
  if (tool === 'bioicons') return <BioiconsPanel />;
  if (tool === 'nih') return <SourceLibraryPanel scope="nih" />;
  if (tool === 'servier') return <SourceLibraryPanel scope="servier" />;

  // library | uploads → personal My Library
  return <SourceLibraryPanel scope="library" />;
}
