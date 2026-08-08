/**
 * Example image prompts for ChatGPT / Claude / Gemini / Grok.
 * Click to copy, then paste into the AI image tool.
 */
export const AI_IMAGE_EXAMPLE_PROMPTS: { id: string; label: string; prompt: string }[] = [
  {
    id: 'pipettor',
    label: 'Pipettor',
    prompt:
      'Simple flat SVG icon of a single-channel micropipette (P1000 style), side view, clean lab icon, white background, no text, high contrast, minimal shading, publication-ready figure icon',
  },
  {
    id: 'hplc',
    label: 'HPLC',
    prompt:
      'Simple flat SVG icon of an HPLC chromatography system (pump, injector, column, detector modules as a compact stack), front view, clean lab equipment icon, white background, no brand logos, no text',
  },
  {
    id: 'fplc',
    label: 'FPLC',
    prompt:
      'Simple flat SVG icon of an FPLC protein purification system with fraction collector, clean scientific equipment icon, white background, no logos, high contrast for a figure',
  },
  {
    id: 'glovebox',
    label: 'Glove box',
    prompt:
      'Simple flat SVG icon of a laboratory glove box with two gloves and a clear viewing window, clean lab icon, white background, no text, minimal detail',
  },
  {
    id: 'gel-ephys',
    label: 'Gel electrophoresis',
    prompt:
      'Simple flat SVG icon of a horizontal gel electrophoresis tank with gel tray and comb, top-down or slight angle, clean lab icon, white background, no text',
  },
  {
    id: 'plate-96',
    label: '96-well plate',
    prompt:
      'Simple flat SVG icon of a 96-well microplate, top-down, clear wells in a grid, flat design, white background, no brand names, high contrast for a figure',
  },
  {
    id: 'flask',
    label: 'Conical flask',
    prompt:
      'Simple flat SVG icon of an Erlenmeyer conical flask with colored liquid solution inside, clean lab glassware icon, white background, no text, flat design',
  },
  {
    id: 'centrifuge',
    label: 'Centrifuge',
    prompt:
      'Simple flat SVG icon of a benchtop laboratory centrifuge with closed lid, front view, clean equipment icon, white background, no logos, no text',
  },
  {
    id: 'plate-reader',
    label: 'Plate reader',
    prompt:
      'Simple flat SVG icon of a microplate reader spectrophotometer, front view with plate drawer slightly open, clean lab instrument icon, white background, no brand logos',
  },
  {
    id: 'pcr',
    label: 'PCR thermocycler',
    prompt:
      'Simple flat SVG icon of a PCR thermocycler block with lid, clean molecular biology lab equipment icon, white background, no text, flat design',
  },
];

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
