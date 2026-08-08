/**
 * Per-source category lists (My Library, Bioicons, NIH, SMA).
 */
import type { LibraryIcon } from '../data/catalog';
import { collectCategories, formatCategoryName, resolveCategoryName } from './libraryCategories';

export type LibrarySourceScope = 'library' | 'bioicons' | 'nih' | 'servier';

const KEY = (scope: LibrarySourceScope) => `bioartist-categories-${scope}-v1`;

export function loadSourceCategories(scope: LibrarySourceScope): string[] {
  try {
    const raw = localStorage.getItem(KEY(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed)
      ? parsed.filter((s) => typeof s === 'string' && s.trim()).map(formatCategoryName)
      : [];
  } catch {
    return [];
  }
}

export function saveSourceCategories(scope: LibrarySourceScope, cats: string[]) {
  try {
    localStorage.setItem(KEY(scope), JSON.stringify(cats));
  } catch {
    /* ignore */
  }
}

/** Icons that belong to this rail panel */
export function iconsForScope(
  all: LibraryIcon[],
  scope: LibrarySourceScope,
): LibraryIcon[] {
  if (scope === 'library') {
    return all.filter((i) => {
      const s = i.source;
      // Personal library: user imports, MCP, servier/nih/bioicons that user moved? 
      // Keep personal: user, mcp, or unset. Exclude pack-source tags unless user.
      return !s || s === 'user' || s === 'mcp';
    });
  }
  return all.filter((i) => i.source === scope);
}

export function categoriesForScope(
  icons: LibraryIcon[],
  scope: LibrarySourceScope,
  saved: string[],
): string[] {
  return collectCategories(iconsForScope(icons, scope), saved);
}

export { resolveCategoryName, formatCategoryName };
