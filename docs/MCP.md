# BioArtist — MCP guide (desktop AI → SVG → canvas)

Use a **desktop AI app** (Claude Desktop, Cursor, Grok Build, etc.) to **generate scientific SVG icons**, then pull them into BioArtist **My Library**.

This is optional. Most researchers only need the [browser guide](./BROWSER.md).

---

## What is MCP here?

**MCP** (Model Context Protocol) is a standard way for AI apps to call local tools.

```
Desktop AI (Claude / Cursor / Grok)
        │  stdio MCP
        ▼
  bioartist-mcp  (this repo: mcp-server/)
        │  writes files
        ▼
  BioArtist/public/mcp-inbox/*.svg
  BioArtist/public/mcp-inbox/manifest.json
        │
        ▼
  Browser: My Library → “Sync MCP inbox” → canvas
```

SVGs are **real files on disk**. Closing the browser does **not** delete them.

---

## Install the MCP server

From the BioArtist project root:

```bash
cd path/to/BioArtist
npm run mcp:install
```

Requires **Node.js 18+**.

---

## Connect your desktop AI app

Point the app at the MCP server entry file (use your real path):

```json
{
  "mcpServers": {
    "bioartist": {
      "command": "node",
      "args": ["/Users/YOUR_USER/GitHub/BioArtist/mcp-server/src/index.js"]
    }
  }
}
```

### Claude Desktop

Edit Claude’s MCP config (location depends on OS), add the block above, restart Claude.

### Cursor

Add the same server under MCP / tools settings, restart if needed.

### Grok Build / other agents

Any client that supports MCP stdio servers can run:

```bash
node /path/to/BioArtist/mcp-server/src/index.js
```

Manual test from a terminal:

```bash
npm run mcp:start
```

(The process waits for MCP messages on stdio; that’s normal.)

---

## Tools available

| Tool | Purpose |
|------|---------|
| `list_templates` | List built-in biology SVG templates |
| `create_scientific_svg` | Build an icon from a template + colors → inbox |
| `create_custom_svg` | Save any SVG markup → inbox |
| `list_inbox` | List icons waiting in the inbox |
| `get_inbox_path` | Absolute path of the inbox folder |

### Templates (examples)

| Template | Description |
|----------|-------------|
| `cell`, `nucleus`, `bacteria`, `virus` | Cell-ish icons |
| `dna`, `protein`, `antibody` | Molecular sketches |
| `cas9_dna` | DNA interacting with Cas9 |
| `lab_setup` | Flask + Eppendorf + pipette → 96-well plate |
| `flask`, `arrow`, `circle`, `hexagon`, `star`, `label` | Simple symbols |

Default colors match BioArtist’s pink theme (`#db2777`). You can pass custom `color` / `secondary`.

### Example prompts for the AI

- “Using bioartist MCP, create a scientific SVG of DNA with Cas9 (`cas9_dna`), name it DNA-Cas9.”  
- “Create template `lab_setup` named Lab setup pink.”  
- “List bioartist inbox items.”  
- “Save this SVG markup as ‘My organelle’ with create_custom_svg.”  

---

## Bring icons into the browser app

1. Start BioArtist: `npm run dev` → open the URL  
2. Open **My Library**  
3. Click **Sync MCP inbox**  
4. Drag icons onto the canvas  
5. **Save** a `.ba` project and/or **Export** PNG/SVG  

### Where files live on disk

```text
BioArtist/public/mcp-inbox/
  manifest.json          ← index for Sync
  some-icon.svg
  ...
```

Copy them anywhere:

```bash
cp public/mcp-inbox/*.svg ~/Desktop/my-icons/
```

---

## How generation works (honest version)

`create_scientific_svg` is **not** a diffusion model of a molecule.

It fills **hand-authored SVG templates** (circles, paths, ellipses) with your colors and writes a file. That keeps icons:

- Vector and editable  
- Fast and reproducible  
- Consistent with the app theme  

For free-form art:

- Use `create_custom_svg` with SVG code from an AI or Inkscape  
- Or download from Bioicons / NIH BioArt / SciDraw and **Import SVG** in the browser  

See also the main [README](../README.md).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Sync says inbox empty | Create at least one SVG with the MCP; check `public/mcp-inbox/manifest.json` |
| AI can’t see the server | Path wrong in config; Node not installed; restart the AI app |
| Icons not in Library after Sync | Hard-refresh the browser; ensure `npm run dev` serves this project |
| Permission errors writing inbox | Run MCP with write access to the BioArtist folder |

---

## Related docs

- [BROWSER.md](./BROWSER.md) — use the web app  
- [DISTRIBUTION.md](./DISTRIBUTION.md) — share with your lab  
- [../mcp-server/README.md](../mcp-server/README.md) — technical MCP notes  
