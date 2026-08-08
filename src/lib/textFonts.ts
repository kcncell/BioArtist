/**
 * Font choices for labels and text boxes.
 *
 * How more fonts are added:
 * 1. List them here (value = CSS font-family stack used by Fabric).
 * 2. Load the face via Google Fonts (or self-host) in `index.html`.
 * 3. Fabric will measure/render with the loaded family once available.
 *
 * System fonts (Arial, Georgia, …) need no network load.
 */

export type FontOption = {
  /** Display name in UI */
  label: string;
  /** CSS font-family string stored on the Fabric object */
  value: string;
  /** Optional group for optgroup */
  group?: 'sans' | 'serif' | 'mono' | 'display' | 'system';
};

export const FONT_OPTIONS: FontOption[] = [
  // Loaded via Google Fonts
  { label: 'Inter', value: 'Inter, system-ui, sans-serif', group: 'sans' },
  { label: 'Roboto', value: 'Roboto, system-ui, sans-serif', group: 'sans' },
  { label: 'Open Sans', value: '"Open Sans", system-ui, sans-serif', group: 'sans' },
  { label: 'Lato', value: 'Lato, system-ui, sans-serif', group: 'sans' },
  { label: 'Montserrat', value: 'Montserrat, system-ui, sans-serif', group: 'sans' },
  { label: 'Poppins', value: 'Poppins, system-ui, sans-serif', group: 'sans' },
  { label: 'Nunito', value: 'Nunito, system-ui, sans-serif', group: 'sans' },
  { label: 'Source Sans 3', value: '"Source Sans 3", system-ui, sans-serif', group: 'sans' },
  { label: 'Work Sans', value: '"Work Sans", system-ui, sans-serif', group: 'sans' },
  { label: 'Raleway', value: 'Raleway, system-ui, sans-serif', group: 'sans' },
  { label: 'Noto Sans', value: '"Noto Sans", system-ui, sans-serif', group: 'sans' },
  { label: 'Fira Sans', value: '"Fira Sans", system-ui, sans-serif', group: 'sans' },
  { label: 'IBM Plex Sans', value: '"IBM Plex Sans", system-ui, sans-serif', group: 'sans' },
  { label: 'Space Grotesk', value: '"Space Grotesk", system-ui, sans-serif', group: 'display' },
  { label: 'Merriweather', value: 'Merriweather, Georgia, serif', group: 'serif' },
  { label: 'Lora', value: 'Lora, Georgia, serif', group: 'serif' },
  { label: 'Playfair Display', value: '"Playfair Display", Georgia, serif', group: 'display' },
  { label: 'PT Serif', value: '"PT Serif", Georgia, serif', group: 'serif' },
  { label: 'Crimson Text', value: '"Crimson Text", Georgia, serif', group: 'serif' },
  { label: 'IBM Plex Mono', value: '"IBM Plex Mono", ui-monospace, monospace', group: 'mono' },
  // System / web-safe (no load)
  { label: 'System UI', value: 'system-ui, sans-serif', group: 'system' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif', group: 'system' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif', group: 'system' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif', group: 'system' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif', group: 'system' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace', group: 'system' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif', group: 'system' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", Helvetica, sans-serif', group: 'system' },
  { label: 'Palatino', value: '"Palatino Linotype", Palatino, serif', group: 'system' },
];

export const FONT_GROUPS: { id: FontOption['group']; label: string }[] = [
  { id: 'sans', label: 'Sans' },
  { id: 'serif', label: 'Serif' },
  { id: 'display', label: 'Display' },
  { id: 'mono', label: 'Mono' },
  { id: 'system', label: 'System' },
];

/** Normalize a stored fontFamily to a known option value when possible. */
export function matchFontOption(fontFamily: string | undefined | null): string {
  if (!fontFamily) return FONT_OPTIONS[0].value;
  const raw = fontFamily.trim().toLowerCase();
  const hit = FONT_OPTIONS.find((f) => f.value.toLowerCase() === raw);
  if (hit) return hit.value;
  // Match by first family name
  const first = raw.split(',')[0]?.replace(/['"]/g, '').trim();
  const byName = FONT_OPTIONS.find(
    (f) => f.value.toLowerCase().split(',')[0]?.replace(/['"]/g, '').trim() === first,
  );
  return byName?.value || fontFamily;
}
