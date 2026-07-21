/** Apply live glass opacity + hue for light or dark liquid-glass themes. */

export type ThemeMode = 'dark' | 'light';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Sharp frosted liquid glass.
 * opacity: 0–0.5 · hue: 0–359 · mode: dark | light
 * Both modes respond strongly to opacity (frost) and hue (tint).
 */
export function applyGlassTheme(
  opacity: number,
  hue: number,
  mode: ThemeMode = 'dark',
) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const o = clamp(opacity, 0, 0.5);
  const h = ((Math.round(hue) % 360) + 360) % 360;
  const dark = mode === 'dark';

  root.style.setProperty('--ba-glass-opacity', String(o));
  root.style.setProperty('--ba-glass-hue', String(h));
  root.dataset.theme = mode;
  root.style.colorScheme = mode;

  if (dark) {
    // Midnight stage + cool ambient glow
    root.style.setProperty('--ba-bg', '#0b0c0f');
    root.style.setProperty(
      '--ba-bg-glow',
      [
        `radial-gradient(1200px 600px at 20% -10%, hsla(${h}, 28%, 55%, ${0.12 + o * 0.18}), transparent 55%)`,
        `radial-gradient(900px 500px at 100% 0%, hsla(${h}, 22%, 40%, ${0.08 + o * 0.12}), transparent 50%)`,
        '#0b0c0f',
      ].join(', '),
    );
    root.style.setProperty('--ba-canvas-bg', '#12141a');

    // Frosted panes — clear at 0, solid at 50%
    const surfaceA = 0.22 + o * 1.2; // 0.22 → 0.82
    root.style.setProperty(
      '--ba-surface',
      `hsla(${h}, ${10 + o * 18}%, ${12 + o * 6}%, ${clamp(surfaceA, 0.14, 0.9)})`,
    );
    root.style.setProperty('--ba-surface-solid', `hsl(${h}, 10%, 10%)`);
    root.style.setProperty(
      '--ba-surface-2',
      `hsla(${h}, 20%, 90%, ${0.04 + o * 0.22})`,
    );
    root.style.setProperty(
      '--ba-surface-3',
      `hsla(${h}, 22%, 92%, ${0.07 + o * 0.3})`,
    );
    root.style.setProperty(
      '--ba-border',
      `hsla(${h}, 30%, 90%, ${0.08 + o * 0.22})`,
    );
    root.style.setProperty(
      '--ba-border-strong',
      `hsla(${h}, 35%, 92%, ${0.14 + o * 0.28})`,
    );
    root.style.setProperty(
      '--ba-glass-highlight',
      `inset 0 1px 0 rgba(255, 255, 255, ${0.12 + o * 0.4}), inset 0 -0.5px 0 rgba(0, 0, 0, 0.35)`,
    );

    root.style.setProperty('--ba-text', '#f0f2f5');
    root.style.setProperty('--ba-text-secondary', '#9aa3b2');
    root.style.setProperty('--ba-text-muted', '#6b7280');
    root.style.setProperty('--ba-accent', `hsl(${h}, 85%, 76%)`);
    root.style.setProperty('--ba-accent-hover', `hsl(${h}, 90%, 86%)`);
    root.style.setProperty(
      '--ba-accent-soft',
      `hsla(${h}, 80%, 70%, ${0.1 + o * 0.2})`,
    );
    root.style.setProperty(
      '--ba-accent-border',
      `hsla(${h}, 80%, 72%, ${0.28 + o * 0.3})`,
    );

    root.style.setProperty(
      '--ba-shadow',
      '0 1px 2px rgba(0, 0, 0, 0.35), 0 1px 0 rgba(255, 255, 255, 0.06) inset',
    );
    root.style.setProperty(
      '--ba-shadow-md',
      '0 8px 32px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.05), 0 1px 0 rgba(255, 255, 255, 0.1) inset',
    );

    const blurPx = 14 + o * 36;
    root.style.setProperty(
      '--ba-blur',
      `blur(${blurPx}px) saturate(${120 + o * 60}%)`,
    );
    root.style.setProperty(
      '--ba-input-bg',
      `rgba(0, 0, 0, ${0.22 + o * 0.35})`,
    );
    root.style.setProperty('--ba-glass-sat', `${10 + o * 18}%`);
    root.style.setProperty('--ba-glass-light', `${12 + o * 6}%`);
  } else {
    /*
     * Light theme — opacity + hue must be obviously visible:
     *  - opacity: clear glass → dense frosted panes
     *  - hue: tints stage glow, surfaces, accents, borders
     */
    const bgSat = 14 + o * 12;
    const bgL = 93 - o * 3;
    root.style.setProperty('--ba-bg', `hsl(${h}, ${bgSat}%, ${bgL}%)`);
    root.style.setProperty(
      '--ba-bg-glow',
      [
        `radial-gradient(1100px 560px at 16% -10%, hsla(${h}, 62%, 62%, ${0.28 + o * 0.2}), transparent 55%)`,
        `radial-gradient(900px 480px at 100% 0%, hsla(${h}, 50%, 68%, ${0.2 + o * 0.16}), transparent 50%)`,
        `linear-gradient(180deg, hsl(${h}, ${22 + o * 10}%, 97%) 0%, hsl(${h}, ${bgSat}%, ${bgL}%) 52%, hsl(${h}, ${bgSat + 2}%, ${bgL - 3}%) 100%)`,
      ].join(', '),
    );
    root.style.setProperty(
      '--ba-canvas-bg',
      `hsl(${h}, ${12 + o * 8}%, ${84 - o * 2}%)`,
    );

    // o=0 → airy (~14% alpha), o=0.5 → solid frost (~92%)
    const surfaceA = 0.14 + o * 1.56;
    const surfaceSat = 22 + o * 28;
    const surfaceL = 98 - o * 6;
    root.style.setProperty(
      '--ba-surface',
      `hsla(${h}, ${surfaceSat}%, ${surfaceL}%, ${clamp(surfaceA, 0.1, 0.94)})`,
    );
    root.style.setProperty(
      '--ba-surface-solid',
      `hsl(${h}, ${10 + o * 8}%, 99%)`,
    );
    root.style.setProperty(
      '--ba-surface-2',
      `hsla(${h}, ${28 + o * 20}%, 96%, ${0.2 + o * 0.55})`,
    );
    root.style.setProperty(
      '--ba-surface-3',
      `hsla(${h}, ${30 + o * 22}%, 94%, ${0.28 + o * 0.58})`,
    );
    root.style.setProperty(
      '--ba-border',
      `hsla(${h}, ${35 + o * 20}%, 28%, ${0.08 + o * 0.16})`,
    );
    root.style.setProperty(
      '--ba-border-strong',
      `hsla(${h}, ${40 + o * 20}%, 26%, ${0.12 + o * 0.2})`,
    );
    root.style.setProperty(
      '--ba-glass-highlight',
      `inset 0 1px 0 rgba(255, 255, 255, ${0.75 + o * 0.2}), inset 0 -0.5px 0 hsla(${h}, 30%, 20%, 0.06)`,
    );

    root.style.setProperty('--ba-text', '#1d1d1f');
    root.style.setProperty('--ba-text-secondary', '#3a3a3c');
    root.style.setProperty('--ba-text-muted', '#6e6e73');
    root.style.setProperty('--ba-accent', `hsl(${h}, ${58 + o * 8}%, ${38 - o * 4}%)`);
    root.style.setProperty('--ba-accent-hover', `hsl(${h}, 62%, 30%)`);
    root.style.setProperty(
      '--ba-accent-soft',
      `hsla(${h}, 60%, 48%, ${0.1 + o * 0.2})`,
    );
    root.style.setProperty(
      '--ba-accent-border',
      `hsla(${h}, 55%, 42%, ${0.24 + o * 0.3})`,
    );

    root.style.setProperty(
      '--ba-shadow',
      `0 1px 2px hsla(${h}, 20%, 20%, ${0.05 + o * 0.06}), 0 1px 0 rgba(255, 255, 255, 0.85) inset`,
    );
    root.style.setProperty(
      '--ba-shadow-md',
      `0 10px 30px hsla(${h}, 25%, 20%, ${0.08 + o * 0.1}), 0 0 0 1px hsla(${h}, 20%, 20%, 0.05), 0 1px 0 rgba(255, 255, 255, 0.9) inset`,
    );

    const blurPx = 12 + o * 40;
    root.style.setProperty(
      '--ba-blur',
      `blur(${blurPx}px) saturate(${110 + o * 50}%)`,
    );
    root.style.setProperty(
      '--ba-input-bg',
      `hsla(${h}, ${18 + o * 12}%, 100%, ${0.35 + o * 0.5})`,
    );
    root.style.setProperty('--ba-glass-sat', `${surfaceSat}%`);
    root.style.setProperty('--ba-glass-light', `${surfaceL}%`);
  }
}
