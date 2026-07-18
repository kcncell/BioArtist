# Distributing BioArtist to fellow researchers

Practical ways to share this tool with a lab, course, or collaborators.

---

## What you’re sharing

| Piece | Needed by everyone? | Notes |
|-------|---------------------|--------|
| **Browser app** (BioArtist UI) | **Yes** | Core figure editor |
| **Icon library + mcp-inbox files** | Yes if you want shared icons | Lives in `public/` |
| **MCP server** | Optional | Only if they use desktop AI to generate SVGs |
| **Node.js** | Yes for local run | Or you host a built site for them |

---

## Option A — Share the GitHub repo (recommended)

Best if your group already uses Git.

1. Push BioArtist to **GitHub** (public or private org/lab repo).  
2. Send collaborators:

```text
Repo: https://github.com/YOUR_ORG/BioArtist
Docs:
  - docs/BROWSER.md  (how to run and use)
  - docs/MCP.md      (optional AI SVG tools)
```

3. They run:

```bash
git clone https://github.com/YOUR_ORG/BioArtist.git
cd BioArtist
npm install
npm run dev
```

**Pros:** updates via `git pull`, versioned, easy forks.  
**Cons:** each person needs Node and runs a local server.

### Suggested README blurb for the lab

> BioArtist is a local web tool for SVG scientific figures.  
> Install Node 18+, clone, `npm install && npm run dev`, open the URL.  
> Save projects as `.ba`. See `docs/BROWSER.md`.

---

## Option B — Zip folder (no Git)

1. Zip the project **without** huge folders if possible:

```bash
cd /path/to
# From parent of BioArtist — exclude node_modules for a smaller zip
zip -r BioArtist-share.zip BioArtist \
  -x "BioArtist/node_modules/*" \
  -x "BioArtist/mcp-server/node_modules/*" \
  -x "BioArtist/dist/*" \
  -x "BioArtist/.git/*"
```

2. Put the zip on:

   - Lab Google Drive / Dropbox / OneDrive  
   - Slack / email (if size allows)  

3. Recipients unzip, then:

```bash
cd BioArtist
npm install
npm run dev
```

Include a one-pager: **“Read docs/BROWSER.md first.”**

**Pros:** simple for non-Git users.  
**Cons:** updates mean re-sending a zip; they still need Node.

---

## Option C — Host a built site (zero Node for users)

You (or IT) build once and host `dist/` on an internal or public static host.

```bash
cd BioArtist
npm install
npm run build
# Upload contents of dist/ to your host
```

Examples:

| Host | Fit |
|------|-----|
| Lab internal nginx / Apache | Intranet-only |
| GitHub Pages | Public free hosting |
| Netlify / Cloudflare Pages / Vercel | Easy CI deploy |
| University static hosting | Follow local policy |

Users only open a **URL** in the browser.

**Caveats**

- **MCP inbox sync** expects files under the same origin’s `/mcp-inbox/`. Hosting static `dist/` still works for the **built-in library** and **user import**, but MCP writes to your **dev machine’s** `public/mcp-inbox` unless you set up a shared write path (advanced).  
- Browser **My Library** and **drafts** are per-browser, not shared between people.  
- Share **`.ba` files** and exported **PNG/SVG** for collaboration on figures.

**Pros:** lowest friction for busy PIs/students.  
**Cons:** you maintain hosting; MCP is mostly for people who also have the repo locally.

---

## Option D — Shared lab machine / workstation

1. Install BioArtist once on a lab Mac/PC.  
2. Leave `npm run dev` or a production server running on a fixed port.  
3. Others open `http://LAB-PC-IP:5173` (network permissions required).  

Use only on a trusted lab network; don’t expose ports to the public internet without IT review.

---

## What to share for co-authoring a figure

People don’t need the whole app to reuse **your** figure:

| Deliverable | Format | Who needs BioArtist? |
|-------------|--------|----------------------|
| Editable project | `.ba` | Yes (Open in BioArtist) |
| Vector figure | `.svg` export | No (Illustrator / Inkscape / PowerPoint) |
| Slide image | `.png` export | No |
| Paper PDF | `.pdf` export | No |
| Icon pack | folder of `.svg` | Optional (Import into My Library) |

**Recommended lab practice**

1. Author keeps a `.ba` in the paper’s `/figures` folder.  
2. Exports PNG + SVG for the manuscript.  
3. Optional: zip of custom icons from `public/mcp-inbox` or My Library downloads.

---

## MCP for the whole lab (optional)

If several people use Claude Desktop / Cursor:

1. Everyone clones the **same** BioArtist repo path convention (or documents their path).  
2. Each installs MCP per [MCP.md](./MCP.md).  
3. Generated SVGs appear in **that clone’s** `public/mcp-inbox/`.  
4. To share icons: commit inbox SVGs to Git, or copy files to a shared drive.

Do **not** expect one person’s MCP writes to appear on another person’s laptop unless you share those files.

---

## Checklist before you send to colleagues

- [ ] `docs/BROWSER.md` and `docs/MCP.md` are in the repo  
- [ ] README links to those docs  
- [ ] `npm install && npm run dev` works on a clean machine  
- [ ] You mention: Node 18+, `.ba` = project file, Export for papers  
- [ ] License note: original icons are for research use; not affiliated with BioRender  
- [ ] If private data: use private GitHub + don’t put unpublished figures in public pages  

---

## One-message template (copy/paste)

```text
Subject: BioArtist — local scientific SVG figure tool

Hi all,

I've set up BioArtist: a browser-based tool for scientific figures with
SVG icons (pathways, cells, labware). No account; runs on your machine.

Setup:
1) Install Node.js 18+ from https://nodejs.org
2) Clone/download: [REPO OR DRIVE LINK]
3) In the folder:  npm install && npm run dev
4) Open http://localhost:5173

How to use: open docs/BROWSER.md
Save figures as .ba; Export PNG/SVG for papers.

Optional (AI-generated icons from Claude/Cursor): docs/MCP.md

Questions: [your email]
```

---

## Related docs

- [BROWSER.md](./BROWSER.md)  
- [MCP.md](./MCP.md)  
- [../README.md](../README.md)  
