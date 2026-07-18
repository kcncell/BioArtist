/** One-click prompts for desktop AI → BioArtist MCP inbox */

export const AI_QUICK_PROMPTS = [
  {
    id: 'one-icon',
    label: 'One scientific icon',
    prompt:
      'Using bioartist MCP: create_scientific_svg with a fitting template (or create_custom_svg) for: [describe icon]. Name it clearly, then list_inbox.',
  },
  {
    id: 'set',
    label: 'Icon set (3–5)',
    prompt:
      'Using bioartist MCP, create 3–5 related scientific SVG icons for: [topic]. Use create_scientific_svg or create_custom_svg, name each clearly, then list_inbox when done.',
  },
  {
    id: 'logo',
    label: 'Logo / badge',
    prompt:
      'Using bioartist MCP create_custom_svg, make a simple vector logo/badge for: [lab or project name]. Keep it clean SVG, ~80×80 viewBox, then list_inbox.',
  },
  {
    id: 'pathway',
    label: 'Pathway pieces',
    prompt:
      'Using bioartist MCP, create SVG icons for a signaling pathway (ligand, receptor, kinase, DNA, arrows) via create_scientific_svg / create_custom_svg, then list_inbox.',
  },
  {
    id: 'lab',
    label: 'Lab gear',
    prompt:
      'Using bioartist MCP, create lab_setup plus flask and pipette icons (create_scientific_svg), name them clearly, list_inbox.',
  },
];

export const MCP_CONFIG_SNIPPET = `{
  "mcpServers": {
    "bioartist": {
      "command": "node",
      "args": ["PATH/TO/BioArtist/mcp-server/src/index.js"]
    }
  }
}`;

export const AI_SETUP_STEPS = [
  {
    n: 1,
    title: 'Connect MCP once',
    body: 'In Claude Desktop, Codex, Cursor, or Grok: add the bioartist MCP server (copy config below). Restart the AI app.',
  },
  {
    n: 2,
    title: 'Ask the AI',
    body: 'Copy a prompt below, paste into your AI, describe what you need. Icons land in public/mcp-inbox/.',
  },
  {
    n: 3,
    title: 'Sync here',
    body: 'Click Sync MCP inbox — icons appear in this panel. Click to place, or right-click to pin / delete.',
  },
];
