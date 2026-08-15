/**
 * BioArtist — Electron main process.
 * Serves the Vite production build from dist/ and proxies RCSB/UniProt
 * so PDB / Chem / library features work offline-from-file (same as dev).
 */
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { URL } = require('url');

const isDev = !app.isPackaged;
let mainWindow = null;
let localServer = null;
let localPort = 0;

/** Candidate roots for static assets (unpacked WASM first, then asar/dist). */
function distRoots() {
  if (isDev) {
    return [path.join(__dirname, '..', 'dist')];
  }
  return [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'dist'),
    path.join(__dirname, '..', 'dist'),
  ].filter((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}

function resolveStaticFile(urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
  const roots = distRoots();
  for (const root of roots) {
    const candidate = path.normalize(path.join(root, rel));
    if (!candidate.startsWith(root)) continue;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  // SPA fallback
  for (const root of roots) {
    const index = path.join(root, 'index.html');
    if (fs.existsSync(index)) return index;
  }
  return null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

const PROXIES = {
  '/api/uniprot': { host: 'rest.uniprot.org', prefix: '/api/uniprot' },
  '/api/rcsb-search': { host: 'search.rcsb.org', prefix: '/api/rcsb-search' },
  '/api/rcsb-data': { host: 'data.rcsb.org', prefix: '/api/rcsb-data' },
  '/api/rcsb-img': { host: 'cdn.rcsb.org', prefix: '/api/rcsb-img' },
};

function matchProxy(pathname) {
  for (const [prefix, cfg] of Object.entries(PROXIES)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return { ...cfg, strip: prefix };
    }
  }
  return null;
}

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url || '/', `http://127.0.0.1`);
        const pathname = decodeURIComponent(u.pathname);

        // API proxies (same paths as vite.config.ts)
        const proxy = matchProxy(pathname);
        if (proxy) {
          const remotePath = pathname.slice(proxy.strip.length) || '/';
          const target = `https://${proxy.host}${remotePath}${u.search}`;
          const headers = { ...req.headers, host: proxy.host };
          delete headers['origin'];
          delete headers['referer'];

          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = Buffer.concat(chunks);

          const upstream = await fetch(target, {
            method: req.method,
            headers,
            body: req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
          });
          const outHeaders = {};
          upstream.headers.forEach((v, k) => {
            // Skip hop-by-hop
            if (['content-encoding', 'transfer-encoding', 'connection'].includes(k)) return;
            outHeaders[k] = v;
          });
          res.writeHead(upstream.status, outHeaders);
          const buf = Buffer.from(await upstream.arrayBuffer());
          res.end(buf);
          return;
        }

        const filePath = resolveStaticFile(pathname);
        if (!filePath) {
          res.writeHead(404);
          res.end('Not found — run npm run build first');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const type = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        fs.createReadStream(filePath).pipe(res);
      } catch (err) {
        console.error('[BioArtist server]', err);
        res.writeHead(500);
        res.end('Server error');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      localPort = typeof addr === 'object' && addr ? addr.port : 0;
      localServer = server;
      resolve(localPort);
    });
    server.on('error', reject);
  });
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'BioArtist',
    backgroundColor: '#0b0c0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // External AI sites, Bioicons, etc. → system browser
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Prevent navigating away from the app accidentally
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const allowed = url.startsWith(`http://127.0.0.1:${port}`);
    if (!allowed && (url.startsWith('http:') || url.startsWith('https:'))) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  void mainWindow.loadURL(`http://127.0.0.1:${port}/`);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [isMac ? { role: 'close' } : { role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  try {
    const roots = distRoots();
    const hasIndex = roots.some((r) => fs.existsSync(path.join(r, 'index.html')));
    if (!hasIndex) {
      console.error('Missing dist/index.html — run: npm run build:electron');
      app.quit();
      return;
    }
    const port = await startLocalServer();
    buildMenu();
    createWindow(port);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
    });
  } catch (e) {
    console.error(e);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (localServer) {
    try {
      localServer.close();
    } catch {
      /* ignore */
    }
  }
  if (process.platform !== 'darwin') app.quit();
});
