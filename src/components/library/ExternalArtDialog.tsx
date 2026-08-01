/**
 * Gate before opening external art / AI image sites.
 * Portaled to document.body so it is never clipped by the left panel.
 */
import { ExternalLink } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../../store/appStore';

export type ExternalArtTarget = {
  title: string;
  url: string;
  /** Short note for this source (license or AI caution) */
  licenseNote: string;
  /** library = Bioicons/NIH/Servier; ai = image generators */
  kind?: 'library' | 'ai';
  /** Optional copy-paste prompts (AI tools only) */
  examplePrompts?: string[];
};

/** Shared targets for My Library external links. */
export const EXTERNAL_ART_SOURCES = {
  bioicons: {
    title: 'Bioicons',
    url: 'https://bioicons.com/',
    kind: 'library' as const,
    licenseNote:
      'Bioicons: each icon has its own license (CC0, CC BY, MIT, etc.). Check the label on every icon you use.',
  },
  nih: {
    title: 'NIH BioArt',
    url: 'https://bioart.niaid.nih.gov/',
    kind: 'library' as const,
    licenseNote:
      'NIH BioArt Source: free for research, educational, and commercial use per NIAID terms — verify attribution on each entry.',
  },
  servier: {
    title: 'Servier Medical Art',
    url: 'https://smart.servier.com/',
    kind: 'library' as const,
    licenseNote:
      'Servier Medical Art (SMART): free under CC BY 4.0 — you must credit Servier and note if you modified the image.',
  },
  /** Alphabetical for UI: ChatGPT, Claude, Gemini, Grok */
  chatgpt: {
    title: 'ChatGPT (image generation)',
    url: 'https://chatgpt.com/',
    kind: 'ai' as const,
    licenseNote:
      'AI can invent wrong anatomy, labels, and proportions. Best for simple lab icons (pipette, plate reader, flask, centrifuge) — not publication-grade anatomy. Your account terms apply; you own checking use rights.',
    examplePrompts: [
      'Flat scientific SVG icon of a micropipette, side view, clean black outline, solid pastel fill, pure white transparent background, no text, no watermark, no logo, centered, minimal vector style',
      'Simple SVG icon of a 96-well microplate, top-down, clear wells in grid, flat design, white background, no brand names, no logos, high contrast for a figure',
      'Minimal lab plate reader machine icon, front view, vector SVG style, flat colors, transparent background, no text, no watermark, no reflections',
    ],
  },
  claude: {
    title: 'Claude (image generation)',
    url: 'https://claude.ai/',
    kind: 'ai' as const,
    licenseNote:
      'AI can invent wrong anatomy, labels, and proportions. Best for simple lab icons (pipette, plate reader, flask, centrifuge) — not publication-grade anatomy. Your Anthropic account terms apply; you own checking use rights.',
    examplePrompts: [
      'Flat scientific SVG icon of a micropipette, side view, clean black outline, solid pastel fill, pure white transparent background, no text, no watermark, no logo, centered, minimal vector style',
      'Simple SVG icon of a 96-well microplate, top-down, clear wells in grid, flat design, white background, no brand names, no logos, high contrast for a figure',
      'Minimal lab plate reader machine icon, front view, vector SVG style, flat colors, transparent background, no text, no watermark, no reflections',
    ],
  },
  gemini: {
    title: 'Gemini (image generation)',
    url: 'https://gemini.google.com/app',
    kind: 'ai' as const,
    licenseNote:
      'AI can invent wrong anatomy, labels, and proportions. Best for simple lab icons (pipette, plate reader, flask, centrifuge) — not publication-grade anatomy. Your Google account terms apply; you own checking use rights.',
    examplePrompts: [
      'Flat scientific SVG icon of a micropipette, side view, clean black outline, solid pastel fill, pure white transparent background, no text, no watermark, no logo, centered, minimal vector style',
      'Simple SVG icon of a 96-well microplate, top-down, clear wells in grid, flat design, white background, no brand names, no logos, high contrast for a figure',
      'Minimal lab plate reader machine icon, front view, vector SVG style, flat colors, transparent background, no text, no watermark, no reflections',
    ],
  },
  grok: {
    title: 'Grok (image generation)',
    url: 'https://grok.com/',
    kind: 'ai' as const,
    licenseNote:
      'AI can invent wrong anatomy, labels, and proportions. Best for simple lab icons (pipette, plate reader, flask, centrifuge) — not publication-grade anatomy. Your xAI account terms apply; you own checking use rights.',
    examplePrompts: [
      'Flat scientific SVG icon of a micropipette, side view, clean black outline, solid pastel fill, pure white transparent background, no text, no watermark, no logo, centered, minimal vector style',
      'Simple SVG icon of a 96-well microplate, top-down, clear wells in grid, flat design, white background, no brand names, no logos, high contrast for a figure',
      'Minimal lab plate reader machine icon, front view, vector SVG style, flat colors, transparent background, no text, no watermark, no reflections',
    ],
  },
} as const satisfies Record<string, ExternalArtTarget>;

export type ExternalArtSourceKey = keyof typeof EXTERNAL_ART_SOURCES;

interface Props {
  target: ExternalArtTarget | null;
  onCancel: () => void;
  onApprove: (target: ExternalArtTarget) => void;
}

export function ExternalArtDialog({ target, onCancel, onApprove }: Props) {
  const showToast = useAppStore((s) => s.showToast);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [target, onCancel]);

  if (!target || typeof document === 'undefined') return null;

  const isAi = target.kind === 'ai';

  return createPortal(
    <div
      className="ba-ext-art-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ba-ext-art-title"
      onClick={onCancel}
    >
      <div className="ba-ext-art-modal" onClick={(e) => e.stopPropagation()}>
        <h3 id="ba-ext-art-title">
          {isAi ? 'Open AI image tool' : 'Open external art source'}
        </h3>
        <p>
          You are about to open <strong>{target.title}</strong> in a new tab
          {isAi ? ' (sign in with your own account if needed)' : ''}.
        </p>
        <div className="ba-ext-art-box">
          <p className="ba-ext-art-box-lead">{isAi ? 'AI caution' : 'Your responsibility'}</p>
          {isAi ? (
            <>
              <p>
                AI models often make mistakes (wrong proportions, fake labels, messy backgrounds).
                They work best for <strong>simple lab icons</strong> — e.g. pipette, 96-well plate,
                plate reader, flask, centrifuge — not detailed anatomy or publication-critical
                structures. Prefer Bioicons / NIH / Servier for professional medical art.
              </p>
              <p className="ba-ext-art-license">{target.licenseNote}</p>
            </>
          ) : (
            <>
              <p>
                BioArtist does not host or license third-party art. It is{' '}
                <strong>your responsibility</strong> to verify each image&apos;s terms before using
                it in a paper, talk, or product — including whether attribution is required,
                whether commercial use is allowed, and whether you must note modifications.
              </p>
              <p className="ba-ext-art-license">{target.licenseNote}</p>
            </>
          )}
        </div>

        {isAi && target.examplePrompts && target.examplePrompts.length > 0 && (
          <div className="ba-ext-art-prompts">
            <p className="ba-ext-art-box-lead">Example prompts (copy into the AI)</p>
            <ul>
              {target.examplePrompts.map((prompt) => (
                <li key={prompt.slice(0, 40)}>
                  <code className="ba-ext-art-prompt">{prompt}</code>
                  <button
                    type="button"
                    className="ba-btn ba-btn-sm"
                    onClick={() => {
                      void navigator.clipboard?.writeText(prompt).then(
                        () => showToast('Prompt copied — paste into the AI chat'),
                        () => showToast('Could not copy — select the text manually'),
                      );
                    }}
                    title="Copy prompt"
                  >
                    Copy
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="ba-ext-art-hint">
          {isAi ? (
            <>
              Ask for <strong>flat vector / SVG-style</strong>, <strong>transparent or pure white
              background</strong>, <strong>no text, no watermark, no logo</strong>. Then download or
              copy → <strong>Import</strong> or <kbd>⌘V</kbd> on the canvas.
            </>
          ) : (
            <>
              After download or copy: use <strong>Import SVG / Image</strong> in My Library, or paste
              onto the canvas with <kbd>⌘V</kbd> / right-click → Paste.
            </>
          )}
        </p>
        <div className="ba-ext-art-actions">
          <button type="button" className="ba-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="ba-btn ba-btn-primary"
            onClick={() => onApprove(target)}
          >
            <ExternalLink size={14} /> I understand — open site
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Open after approval — shared by PackCards / LibraryPanel. */
export function openExternalArtTarget(target: ExternalArtTarget): void {
  window.open(target.url, '_blank', 'noopener,noreferrer');
}
