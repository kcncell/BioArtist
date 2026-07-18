# BioArtist

**Scientific SVG illustration editor** with a BioRender-like workspace. Browse a built-in biology icon library, import your own SVGs into **My Library**, compose figures on a canvas, and export PNG / SVG / PDF.

> Not affiliated with BioRender. Original UI, original icons, SVG-first workflow.

## Quick start

```bash
cd /Users/pradyu/GitHub/BioArtist
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

Theme: **flowery pink** (accent `#db2777`).  
Projects save as **`.ba`** files.

## Docs for researchers

| Doc | Audience |
|-----|----------|
| **[docs/BROWSER.md](./docs/BROWSER.md)** | How to run and use the web app |
| **[docs/MCP.md](./docs/MCP.md)** | Desktop AI → generate SVGs → Sync inbox |
| **[docs/DISTRIBUTION.md](./docs/DISTRIBUTION.md)** | Share with your lab / collaborators |

### External icon packs

In **My Library**:

- **Bioicons** — one-click install of the open catalog (license per icon; SVG via CDN). Rebuild catalog: `npm run packs:bioicons` (needs a local [bioicons](https://github.com/duerrsimon/bioicons) clone).
- **NIH BioArt** — open the official site, download SVGs, then **Import SVG folder** for in-app browse.

## MCP: create SVGs from a desktop AI app

Yes — supported. Start with **[docs/MCP.md](./docs/MCP.md)** (technical notes also in [mcp-server/README.md](./mcp-server/README.md)).

```bash
npm run mcp:install
# Configure Claude Desktop / Cursor / Grok to run:
# node /Users/pradyu/GitHub/BioArtist/mcp-server/src/index.js
```

Desktop agent calls `create_scientific_svg` → files land in `public/mcp-inbox/` → BioArtist **My Library → Sync MCP inbox**.

## Features

- **Library panel** — 40+ copyright-free scientific SVG icons (cell, DNA/RNA, protein, lab, arrows, symbols)
- **Quick tools** — shapes and text always available above the library
- **Grid / snap / pan** — Space+drag pan, snap-to-grid, artboard presets
- **My Library** — import any `.svg` (file picker or drag-drop); icons appear immediately and stay reusable
- **Canvas** — select, move, scale, rotate, multi-select, group/ungroup
- **Properties** — fill, stroke, opacity, rotation, flip
- **Layers** — visibility, lock, rename
- **History** — undo / redo
- **Export** — PNG (2×), SVG, PDF
- **Projects** — save/load `.ba` files; auto-draft recovery in the browser
- **Shortcuts** — `V` select, `T` text, `⌘/Ctrl+Z` undo, `⌘/Ctrl+D` duplicate, `⌘/Ctrl+G` group, `⌘/Ctrl+S` save, `⌘/Ctrl+E` export, `Delete` remove

## Import workflow

1. Open **My Library** (upload icon in the left rail).
2. Drop SVG files or click **browse**.
3. Imported icons show as thumbnails in My Library.
4. Drag (or click) an icon onto the canvas to place it.

Dropping SVG files onto the canvas also adds them to My Library and places the first file.

## Tech stack

- React 19 + TypeScript + Vite
- Fabric.js (canvas / SVG)
- Zustand (state)
- jsPDF (PDF export)

## Scripts

| Command        | Description              |
|----------------|--------------------------|
| `npm run dev`  | Development server       |
| `npm run build`| Production build         |
| `npm run preview` | Preview production build |

## License

Icons and app code in this repository are original for BioArtist. Use freely for research figures; attribute “BioArtist” if you wish.
