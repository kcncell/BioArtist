/**
 * My Library organization categories (stored on LibraryIcon.folder).
 * UI label: “Category”. Field name kept as folder for storage compatibility.
 */

/** Case/space-insensitive key for matching category names */
export function categoryKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Pretty canonical form (trimmed, collapsed spaces) */
export function formatCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * If an equivalent category already exists, reuse its exact spelling so
 * re-imports (e.g. same zip twice) merge into one chip.
 */
export function resolveCategoryName(
  hint: string | undefined | null,
  existing: string[],
): string | undefined {
  if (!hint) return undefined;
  const pretty = formatCategoryName(hint);
  if (!pretty) return undefined;
  const key = categoryKey(pretty);
  const found = existing.find((e) => categoryKey(e) === key);
  return found || pretty;
}

/** Collect unique category names from icons + saved list */
export function collectCategories(
  icons: { folder?: string }[],
  saved: string[] = [],
): string[] {
  const map = new Map<string, string>(); // key → display name
  for (const s of saved) {
    const pretty = formatCategoryName(s);
    if (!pretty) continue;
    const k = categoryKey(pretty);
    if (!map.has(k)) map.set(k, pretty);
  }
  for (const icon of icons) {
    const pretty = formatCategoryName(icon.folder || '');
    if (!pretty) continue;
    const k = categoryKey(pretty);
    if (!map.has(k)) map.set(k, pretty);
  }
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}
