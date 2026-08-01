#!/usr/bin/env node
/**
 * BioArtist MCP Server
 *
 * Lets desktop AI apps (Claude Desktop, Cursor, Grok, etc.) create SVG icons
 * and drop them into BioArtist's mcp-inbox so users can Sync → My Library.
 *
 * Tools:
 *   create_scientific_svg  – generate a biology-style SVG from a template
 *   create_custom_svg      – save any SVG markup to the inbox
 *   list_inbox             – list inbox files waiting for BioArtist
 *   get_inbox_path         – absolute path of the inbox folder
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TEMPLATES, buildFromTemplate } from './templates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// mcp-server/src → BioArtist/public/mcp-inbox
const INBOX = path.resolve(__dirname, '../../public/mcp-inbox');
const MANIFEST = path.join(INBOX, 'manifest.json');

function ensureInbox() {
  fs.mkdirSync(INBOX, { recursive: true });
  if (!fs.existsSync(MANIFEST)) {
    fs.writeFileSync(MANIFEST, JSON.stringify({ version: 1, items: [] }, null, 2));
  }
}

function readManifest() {
  ensureInbox();
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch {
    return { version: 1, items: [] };
  }
}

function writeManifest(manifest) {
  ensureInbox();
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
}

function slugify(name) {
  return String(name || 'icon')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'icon';
}

function addToInbox({ name, category, filename, svg }) {
  ensureInbox();
  const filePath = path.join(INBOX, filename);
  fs.writeFileSync(filePath, svg.endsWith('\n') ? svg : svg + '\n');

  const manifest = readManifest();
  const id = `mcp/${filename.replace(/\.svg$/i, '')}`;
  // replace if same filename
  manifest.items = manifest.items.filter((i) => i.filename !== filename);
  const item = {
    id,
    name,
    category: category || 'symbols',
    filename,
    path: `/mcp-inbox/${filename}`,
    createdAt: new Date().toISOString(),
    source: 'mcp',
  };
  manifest.items.unshift(item);
  writeManifest(manifest);
  return item;
}

const server = new McpServer({
  name: 'bioartist-mcp',
  version: '1.0.0',
});

server.tool(
  'create_scientific_svg',
  'Generate a scientific / biology-style SVG icon and save it to the BioArtist MCP inbox. After creating, open BioArtist → My Library → Sync MCP inbox.',
  {
    name: z.string().describe('Human-readable icon name, e.g. "Mitochondria pink"'),
    template: z
      .enum([
        'cell',
        'nucleus',
        'bacteria',
        'virus',
        'dna',
        'protein',
        'antibody',
        'flask',
        'pipette',
        'arrow',
        'circle',
        'hexagon',
        'star',
        'label',
        'cas9_dna',
        'lab_setup',
      ])
      .describe('Shape / biology template (pipette, flask, cas9_dna, lab_setup, …)'),
    color: z
      .string()
      .optional()
      .describe('Primary fill color hex, default flower pink #db2777'),
    secondary: z
      .string()
      .optional()
      .describe('Secondary / stroke color hex'),
    category: z
      .enum(['cell', 'dna', 'protein', 'lab', 'arrows', 'symbols'])
      .optional()
      .describe('Library category tag'),
  },
  async ({ name, template, color, secondary, category }) => {
    const primary = color || '#db2777';
    const stroke = secondary || '#9d174d';
    const svg = buildFromTemplate(template, { primary, stroke, label: name });
    const filename = `${slugify(name)}-${Date.now().toString(36)}.svg`;
    const item = addToInbox({
      name,
      category: category || TEMPLATES[template]?.category || 'symbols',
      filename,
      svg,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ok: true,
              message: `SVG “${name}” written to BioArtist inbox.`,
              item,
              next_step:
                'In BioArtist, open My Library and click “Sync MCP inbox” (or refresh if auto-sync is on). Then drag the icon onto the canvas.',
              inbox_path: INBOX,
              svg_preview: svg.slice(0, 400) + (svg.length > 400 ? '…' : ''),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  'create_custom_svg',
  'Save arbitrary SVG markup into the BioArtist MCP inbox for import into My Library.',
  {
    name: z.string().describe('Icon display name'),
    svg: z.string().describe('Full SVG markup including <svg>…</svg>'),
    category: z
      .enum(['cell', 'dna', 'protein', 'lab', 'arrows', 'symbols'])
      .optional()
      .describe('Library category'),
  },
  async ({ name, svg, category }) => {
    if (!svg.includes('<svg')) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ok: false, error: 'svg must contain an <svg> element' }),
          },
        ],
        isError: true,
      };
    }
    const filename = `${slugify(name)}-${Date.now().toString(36)}.svg`;
    const item = addToInbox({
      name,
      category: category || 'symbols',
      filename,
      svg,
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ok: true,
              message: `Custom SVG “${name}” saved to inbox.`,
              item,
              next_step: 'BioArtist → My Library → Sync MCP inbox',
              inbox_path: INBOX,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  'list_inbox',
  'List SVG icons currently waiting in the BioArtist MCP inbox.',
  {},
  async () => {
    const manifest = readManifest();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ok: true,
              count: manifest.items.length,
              inbox_path: INBOX,
              items: manifest.items,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  'get_inbox_path',
  'Return the absolute filesystem path of the BioArtist MCP inbox folder.',
  {},
  async () => {
    ensureInbox();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: true,
            inbox_path: INBOX,
            manifest: MANIFEST,
            public_url_base: '/mcp-inbox/',
          }),
        },
      ],
    };
  },
);

server.tool(
  'list_templates',
  'List available scientific SVG templates for create_scientific_svg.',
  {},
  async () => {
    const list = Object.entries(TEMPLATES).map(([id, t]) => ({
      id,
      category: t.category,
      description: t.description,
    }));
    return {
      content: [{ type: 'text', text: JSON.stringify({ ok: true, templates: list }, null, 2) }],
    };
  },
);

ensureInbox();
const transport = new StdioServerTransport();
await server.connect(transport);
