/**
 * Preload bridge — keep minimal; renderer stays a plain web app.
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('bioartistDesktop', {
  isElectron: true,
  platform: process.platform,
});
