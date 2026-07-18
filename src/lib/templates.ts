import type { UserTemplate } from '../types';
import {
  addSvgToCanvas,
  addText,
  clearCanvas,
  exportJSON,
  fetchSvgText,
  importJSON,
} from './canvasController';

export interface BuiltinTemplate {
  id: string;
  name: string;
  description: string;
  source: 'builtin';
  build: () => Promise<void>;
}

export type TemplateListItem =
  | BuiltinTemplate
  | (UserTemplate & { source: 'import' | 'mcp' });

async function place(
  path: string,
  name: string,
  left: number,
  top: number,
  maxSize = 120,
) {
  const svg = await fetchSvgText(path);
  await addSvgToCanvas(svg, { left, top, name, maxSize });
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'signaling',
    name: 'Signaling cascade',
    description: 'Ligand → receptor → kinase pathway sketch',
    source: 'builtin',
    build: async () => {
      clearCanvas();
      await place('/library/protein/ligand.svg', 'Ligand', 160, 280, 90);
      await place('/library/arrows/arrow-right.svg', 'Arrow', 280, 280, 70);
      await place('/library/protein/receptor.svg', 'Receptor', 400, 280, 110);
      await place('/library/arrows/arrow-right.svg', 'Arrow', 520, 280, 70);
      await place('/library/protein/kinase.svg', 'Kinase', 640, 280, 100);
      await place('/library/arrows/arrow-right.svg', 'Arrow', 760, 280, 70);
      await place('/library/dna/double-helix.svg', 'DNA', 860, 280, 90);
      addText('Signaling cascade');
    },
  },
  {
    id: 'cell-overview',
    name: 'Cell overview',
    description: 'Organelles arranged in a simple cell figure',
    source: 'builtin',
    build: async () => {
      clearCanvas();
      await place('/library/cell/animal-cell.svg', 'Cell', 450, 300, 220);
      await place('/library/cell/nucleus.svg', 'Nucleus', 450, 280, 80);
      await place('/library/cell/mitochondria.svg', 'Mitochondria', 560, 360, 70);
      await place('/library/cell/golgi.svg', 'Golgi', 340, 360, 70);
      addText('Cell overview');
    },
  },
  {
    id: 'lab-workflow',
    name: 'Lab workflow',
    description: 'Sample → tube → PCR → plate',
    source: 'builtin',
    build: async () => {
      clearCanvas();
      await place('/library/lab/pipette.svg', 'Pipette', 180, 280, 100);
      await place('/library/arrows/arrow-right.svg', 'Arrow', 300, 280, 60);
      await place('/library/lab/test-tube.svg', 'Tube', 400, 280, 100);
      await place('/library/arrows/arrow-right.svg', 'Arrow', 520, 280, 60);
      await place('/library/lab/pcr.svg', 'PCR', 620, 280, 100);
      await place('/library/arrows/arrow-right.svg', 'Arrow', 740, 280, 60);
      await place('/library/lab/well-plate.svg', 'Plate', 840, 280, 100);
      addText('Lab workflow');
    },
  },
];

/** @deprecated use BUILTIN_TEMPLATES */
export const TEMPLATES = BUILTIN_TEMPLATES;

export async function applyBuiltinTemplate(t: BuiltinTemplate): Promise<void> {
  await t.build();
}

export async function applyUserTemplate(t: UserTemplate): Promise<void> {
  if (!t.project?.canvas) {
    throw new Error('Template has no canvas data');
  }
  await importJSON(t.project);
}

export function sortTemplatesByPin<T>(
  items: T[],
  pinnedIds: string[],
  getId: (item: T) => string = (i) => (i as { id: string }).id,
): T[] {
  const pinSet = new Set(pinnedIds);
  const pinned = items.filter((i) => pinSet.has(getId(i)));
  const rest = items.filter((i) => !pinSet.has(getId(i)));
  // Preserve pin order from pinnedIds
  pinned.sort((a, b) => pinnedIds.indexOf(getId(a)) - pinnedIds.indexOf(getId(b)));
  return [...pinned, ...rest];
}

export function parseTemplateFile(
  text: string,
  fileName: string,
): Omit<UserTemplate, 'id' | 'createdAt'> {
  const data = JSON.parse(text) as Record<string, unknown>;
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid template file');
  }
  // Accept full .ba projects or wrapped templates
  const project =
    data.project && typeof data.project === 'object'
      ? (data.project as UserTemplate['project'])
      : {
          version: typeof data.version === 'number' ? data.version : 1,
          artboard:
            data.artboard && typeof data.artboard === 'object'
              ? (data.artboard as { width: number; height: number })
              : undefined,
          canvas: data.canvas,
          projectName:
            typeof data.projectName === 'string' ? data.projectName : undefined,
        };

  if (!project.canvas) {
    throw new Error('File has no canvas data — save a .ba project first');
  }

  const baseName = fileName.replace(/\.(ba|bioartist|json)$/i, '').replace(/[_-]+/g, ' ');
  const name =
    (typeof data.name === 'string' && data.name) ||
    (typeof data.projectName === 'string' && data.projectName) ||
    baseName ||
    'Imported template';
  const description =
    (typeof data.description === 'string' && data.description) ||
    'Imported figure template';

  return {
    name,
    description,
    source: data.source === 'mcp' ? 'mcp' : 'import',
    project,
  };
}

/** Snapshot the current canvas as a user template payload. */
export function snapshotCurrentAsTemplate(
  name: string,
  description = 'Saved from canvas',
): Omit<UserTemplate, 'id' | 'createdAt'> | null {
  const data = exportJSON();
  if (!data?.canvas) return null;
  return {
    name,
    description,
    source: 'import',
    project: {
      version: data.version,
      artboard: data.artboard,
      canvas: data.canvas,
      projectName: name,
    },
  };
}

export const MCP_TEMPLATE_PROMPTS = [
  {
    id: 'signaling',
    label: 'Signaling pathway figure',
    tool: 'Claude / Codex / Grok',
    prompt:
      'Using the bioartist MCP tools, create scientific SVG icons for a signaling cascade (ligand, receptor, kinase, DNA) with create_scientific_svg or create_custom_svg, then list the inbox so I can Sync MCP in BioArtist and assemble a pathway template.',
  },
  {
    id: 'cell',
    label: 'Cell diagram icons',
    tool: 'Claude / Codex / Grok',
    prompt:
      'Using bioartist MCP, create SVGs for cell, nucleus, mitochondria, and golgi (templates cell, nucleus, or create_custom_svg). Name them clearly and list_inbox when done.',
  },
  {
    id: 'crispr',
    label: 'CRISPR / Cas9 scene',
    tool: 'Claude / Codex / Grok',
    prompt:
      'Using bioartist MCP create_scientific_svg with template cas9_dna named DNA-Cas9, then create any extra labels with create_custom_svg. List inbox when finished.',
  },
  {
    id: 'lab',
    label: 'Lab workflow icons',
    tool: 'Claude / Codex / Grok',
    prompt:
      'Using bioartist MCP, run create_scientific_svg with template lab_setup named Lab setup, plus flask and pipette icons. List bioartist inbox items when done.',
  },
  {
    id: 'custom',
    label: 'Custom figure description',
    tool: 'Claude / Codex / Grok',
    prompt:
      'I need a scientific figure template for BioArtist. Using the bioartist MCP server: (1) list_templates, (2) create_scientific_svg or create_custom_svg for each icon I describe, (3) list_inbox. Description: [describe your figure here].',
  },
];
