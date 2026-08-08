# BioArtist

**Scientific SVG illustration editor** with a BioRender-like workspace. Browse a built-in biology icon library, import your own SVGs into **My Library**, compose figures on a canvas, and export PNG / SVG / PDF.

> Not affiliated with BioRender. Original UI, original icons, SVG-first workflow.

---

## Try BioArtist

Run BioArtist on your own computer. It works on **macOS**, **Windows**, and **Linux** as a local web app in your browser (Chrome or Edge recommended).

A one-click desktop installer (Tauri / Electron) is planned later. For now, use the steps below.

### What you need (all platforms)

1. **Node.js 20 or newer** — install from [https://nodejs.org](https://nodejs.org) (LTS is fine).  
   After install, open a terminal and check:

   ```bash
   node -v
   npm -v
   ```

   You should see version numbers (for example `v20.x` and `10.x`).

2. **Git** (optional but recommended) — [https://git-scm.com](https://git-scm.com)  
   Or download the project as a ZIP from GitHub (no Git needed).

3. A modern browser: **Chrome** or **Edge** work best.

---

### Option A — Clone with Git (recommended)

#### macOS

1. Open **Terminal** (Applications → Utilities → Terminal).
2. Run:

```bash
git clone https://github.com/kcncell/BioArtist.git
cd BioArtist
npm install
npm run dev
```

3. When the server starts, look for a line like:

   `Local: http://localhost:5173/`

4. Open that address in Chrome (or click the link if your terminal supports it).

#### Windows

1. Open **PowerShell** or **Command Prompt**  
   (Start menu → type `PowerShell` → Enter).
2. Run:

```powershell
git clone https://github.com/kcncell/BioArtist.git
cd BioArtist
npm install
npm run dev
```

3. Open the URL Vite prints (usually `http://localhost:5173`) in **Chrome** or **Edge**.

> If `git` is not found, install Git for Windows, or use **Option B** (ZIP) below.

#### Linux

1. Open a terminal.
2. Install Node.js 20+ if needed (example for Ubuntu/Debian with NodeSource, or use your distro packages / `nvm`).
3. Run:

```bash
git clone https://github.com/kcncell/BioArtist.git
cd BioArtist
npm install
npm run dev
```

4. Open `http://localhost:5173` in Chrome, Chromium, or Firefox.

---

### Option B — Download ZIP (no Git)

Works the same on **macOS**, **Windows**, and **Linux**.

1. Open: [https://github.com/kcncell/BioArtist](https://github.com/kcncell/BioArtist)
2. Click **Code → Download ZIP**.
3. Unzip the folder (for example to Desktop).
4. Open a terminal in that folder:

   - **macOS:** Right-click the folder → Services → New Terminal at Folder  
     (or `cd` into it in Terminal).
   - **Windows:** Open the folder in File Explorer → click the address bar → type `powershell` → Enter.  
     Or: `cd` into the unzipped folder in PowerShell.
   - **Linux:** Open a terminal and `cd` into the unzipped folder.

5. Run:

```bash
npm install
npm run dev
```

6. Open `http://localhost:5173` in your browser.

---

### First run notes

| Topic | Detail |
|--------|--------|
| **First `npm install`** | Can take several minutes. Needs internet once. |
| **Stop the app** | In the terminal, press `Ctrl+C` (Windows/Linux) or `Ctrl+C` (macOS). |
| **Start again later** | `cd BioArtist` then `npm run dev` (no need to reinstall every time). |
| **Update to latest** | If you used Git: `git pull` then `npm install` then `npm run dev`. |
| **Your data** | Library icons and drafts stay in **your browser** on that machine (not on GitHub). |
| **Chem Studio** | Available at `http://localhost:5173/chem` after the dev server is running. |

### Troubleshooting

| Problem | What to try |
|---------|-------------|
| `node` / `npm` not found | Reinstall Node.js LTS and **restart the terminal**. |
| `git` not found | Install Git, or use the ZIP method. |
| Port already in use | Vite will pick another port (e.g. `5174`) — use the URL it prints. |
| Blank page / weird paste | Use **Chrome** or **Edge**. |
| `npm install` fails | Check internet; try deleting `node_modules` and running `npm install` again. |

### What to try in the app

- **My Library** — import SVG / images / folder / zip; organize with categories  
- **Bioicons** — install and browse the open icon pack  
- **NIH / SMA** — website link + your own imports  
- **Text / shapes / lines** — figure labels and layouts  
- **AI image tools** — copy example prompts, open ChatGPT / Claude / Gemini / Grok  
- **Export** — PNG, JPG, SVG, PDF  

Projects save as **`.ba`** files. Theme controls (Light/Dark, glass opacity/hue) are in the top bar.

---

## Quick start (short)

```bash
git clone https://github.com/kcncell/BioArtist.git
cd BioArtist
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

- **Figure editor:** `/`
- **Chem Studio** (Ketcher sketcher): `/chem`

## Docs for researchers

| Doc | Audience |
|-----|----------|
| **[docs/BROWSER.md](./docs/BROWSER.md)** | How to run and use the web app |
| **[docs/MCP.md](./docs/MCP.md)** | Desktop AI → generate SVGs → Sync inbox |
| **[docs/DISTRIBUTION.md](./docs/DISTRIBUTION.md)** | Share with your lab / collaborators |

### External icon packs

- **Bioicons** (left rail) — install the open catalog (license per icon; SVG via CDN). Rebuild catalog: `npm run packs:bioicons` (needs a local [bioicons](https://github.com/duerrsimon/bioicons) clone).
- **NIH BioArt / Servier (SMA)** — open the official site, download art, then import (SVG / folder / zip) into that panel’s library.

## MCP: create SVGs from a desktop AI app

Yes — supported. Start with **[docs/MCP.md](./docs/MCP.md)** (technical notes also in [mcp-server/README.md](./mcp-server/README.md)).

```bash
npm run mcp:install
# Configure Claude Desktop / Cursor / Grok to run (use YOUR absolute path):
# node /absolute/path/to/BioArtist/mcp-server/src/index.js
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
