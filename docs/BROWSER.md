# BioArtist — Browser guide (for researchers)

BioArtist is a **web app** for composing scientific figures from SVG icons (BioRender-like workflow, SVG-first).

You do **not** need an account. Everything runs in the browser on your computer.

---

## 1. Run BioArtist (local)

### Prerequisites

- A computer with **Node.js 18+** ([nodejs.org](https://nodejs.org/))
- A modern browser (Chrome, Firefox, Safari, Edge)
- This project folder (from GitHub, zip, or a shared drive)

### Commands

```bash
cd path/to/BioArtist
npm install
npm run dev
```

Open the URL Vite prints, usually:

**http://127.0.0.1:5173/**  
or **http://localhost:5173/**

Stop the server with `Ctrl+C` in the terminal.

### Production build (optional)

If someone wants a static build (e.g. lab server):

```bash
npm run build
npm run preview
```

Or host the `dist/` folder on any static file host (see [DISTRIBUTION.md](./DISTRIBUTION.md)).

---

## 2. Interface overview

| Area | What it does |
|------|----------------|
| **Left rail** | Select, Library, My Library, quick shape/text |
| **Assets panel** | Built-in icons, search, categories, templates |
| **My Library** | Your imports + **Sync MCP inbox** |
| **Canvas** | Drag, select, scale, rotate figures |
| **Properties** | Fill, stroke, opacity, text style |
| **Layers** | Show/hide, lock, rename |
| **Top bar** | Undo/redo, zoom, align, **Save** (`.ba`), **Export** |

Theme: flowery pink accent (not a BioRender clone).

---

## 3. Everyday workflow

1. **Browse icons** — Library → pick category (Cell, DNA, Lab, …) or search  
2. **Click or drag** an icon onto the canvas  
3. **Add text** — press `T` or use the quick **T** button  
4. **Arrange** — select + drag; multi-select then Align (top bar)  
5. **Recolor** — select object → Properties → fill swatches  
6. **Export** — PNG (slides), SVG (vector), PDF (raster page)

### Templates (fast start)

In the Assets panel under **Templates**:

- Signaling cascade  
- Cell overview  
- Lab workflow  

These place a starter layout you can edit.

### Protein ribbon (PDB / UniProt)

In the Assets panel, **Protein ribbon** box:

1. Type a **protein name** (e.g. `hemoglobin`), **UniProt ID** (e.g. `P69905`), or **PDB ID** (e.g. `4HHB`)  
2. Click **Find**  
3. Click **Add** on a hit  

Imports an RCSB PDB ribbon cartoon onto the canvas (and My Library). You can move, scale, flip, and change opacity. It is a **raster image** (not a recolorable SVG path), so full recolor is limited.

---

## 4. Import your own art

### SVG or images from your computer

1. Open **My Library**  
2. Drop files or use **browse SVG** / **browse image**  
3. Icons appear as thumbnails → drag onto canvas  

Supported: `.svg`, PNG, JPG, WebP, GIF.

### External icon packs (Bioicons & NIH BioArt)

In **My Library** you will see two pack cards:

| Pack | One-click action |
|------|------------------|
| **Bioicons** | **Add Bioicons pack** — installs catalog (~2.5k icons, or CC0-only). Icons stream from CDN when placed. Filter by license (CC0 / needs credit). |
| **NIH BioArt** | **Open NIH BioArt** to download SVGs, then **Import SVG folder** for seamless browse in BioArtist. |

Credits and license labels show on pack icons. Always check attribution before publication.

### MCP-generated icons (optional)

If your lab uses the desktop MCP (see [MCP.md](./MCP.md)):

1. Open **My Library**  
2. Click **Sync MCP inbox**  
3. Use the new icons on the canvas  

---

## 5. Saving your work

| What | How | Survives closing the browser? |
|------|-----|--------------------------------|
| **Project figure** | Top bar **Save** → downloads `Name.ba` | Yes (as a file on disk) |
| **Reopen project** | **Open** → pick a `.ba` file (also accepts old `.bioartist`) | Yes |
| **Auto-draft** | Saved automatically in the browser | Usually yes (same browser/profile) |
| **Publication file** | **Export** → PNG / SVG / PDF | Yes (download) |
| **My Library icons** | Stored in browser IndexedDB | Yes until you clear site data |
| **Built-in / MCP files** | Live in the project folder on disk | Yes (normal files) |

**Best practice for a paper figure**

1. **Save** a `.ba` project (editable later)  
2. **Export** PNG (slides) and/or SVG (vector journals)  
3. Keep copies in your paper folder / lab drive  

---

## 6. Keyboard shortcuts

| Key | Action |
|-----|--------|
| `V` | Select |
| `T` | Add text |
| `Delete` | Delete selection |
| `⌘/Ctrl + Z` | Undo |
| `⌘/Ctrl + ⇧ + Z` | Redo |
| `⌘/Ctrl + D` | Duplicate |
| `⌘/Ctrl + G` | Group |
| `⌘/Ctrl + S` | Save `.ba` |
| `⌘/Ctrl + E` | Export |
| `⌘/Ctrl + V` | Paste SVG markup or image from clipboard onto canvas (also adds to My Library) |
| `Space + drag` | Pan canvas |
| `⌘/Ctrl + scroll` | Zoom |
| `?` | Shortcuts help |

### Paste SVG from clipboard

1. Copy an SVG (from Bioicons download, a code editor, Finder, etc.)  
2. Click the **canvas** (not a text field)  
3. Press **⌘V** (Mac) or **Ctrl+V** (Windows/Linux)  

The icon is placed on the artboard and saved into **My Library**.

---

## 7. File types you’ll see

| Extension | Meaning |
|-----------|---------|
| `.ba` | BioArtist project (JSON canvas + metadata) |
| `.svg` | Vector icon or exported figure |
| `.png` | Raster export |
| `.pdf` | PDF export (flattened image page) |

---

## 8. Troubleshooting

| Problem | Try this |
|---------|----------|
| Page won’t load | Is `npm run dev` still running? |
| Icons missing after refresh | Hard refresh; check you’re on the same URL/port |
| My Library empty after Sync | MCP inbox may be empty — see [MCP.md](./MCP.md) |
| Lost canvas | **Open** your last `.ba` save; draft may restore on reload |
| Cleared “site data” | My Library drafts are gone; disk files under `public/` remain |

---

## 9. Privacy

- Runs **locally** by default (no BioArtist cloud login)  
- Saves go to **your** Downloads / chosen folder  
- Browser storage is **on your machine** only  

If you host `dist/` on a shared lab server, treat it like any internal web tool (HTTPS, access control).

---

## Related docs

- [MCP.md](./MCP.md) — create SVGs from a desktop AI app  
- [DISTRIBUTION.md](./DISTRIBUTION.md) — share with collaborators  
- [../README.md](../README.md) — project overview  
