import type { LibraryIcon } from '../data/catalog';

export interface McpInboxItem {
  id: string;
  name: string;
  category: string;
  filename: string;
  path: string;
  createdAt?: string;
  source?: string;
}

export interface McpManifest {
  version: number;
  items: McpInboxItem[];
}

/**
 * Fetch MCP inbox manifest written by bioartist-mcp into public/mcp-inbox.
 */
export async function fetchMcpManifest(): Promise<McpManifest> {
  const res = await fetch(`/mcp-inbox/manifest.json?t=${Date.now()}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`MCP inbox not found (${res.status}). Is the MCP server writing to public/mcp-inbox?`);
  }
  return (await res.json()) as McpManifest;
}

/**
 * Load inbox items as LibraryIcon[] with svgContent filled for My Library.
 */
export async function loadMcpInboxIcons(): Promise<LibraryIcon[]> {
  const manifest = await fetchMcpManifest();
  const icons: LibraryIcon[] = [];

  for (const item of manifest.items || []) {
    try {
      const res = await fetch(`${item.path}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const svgContent = await res.text();
      if (!svgContent.includes('<svg')) continue;
      icons.push({
        id: item.id || `mcp/${item.filename}`,
        name: item.name || item.filename,
        category: item.category || 'symbols',
        path: item.path,
        svgContent,
        source: 'mcp',
        pack: 'mcp',
        author: 'MCP inbox',
        licenseLabel: 'MCP',
      });
    } catch {
      // skip broken file
    }
  }
  return icons;
}
