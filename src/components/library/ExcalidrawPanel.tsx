/**
 * Excalidraw panel — clean layout matching other rail tools.
 * AI links → example prompts → paste JSON/SVG → place on canvas.
 */
import { ClipboardPaste, Copy, ExternalLink, Pencil, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  EXCALIDRAW_EXAMPLE_PROMPTS,
  looksLikeExcalidrawJson,
  placeExcalidrawCode,
} from '../../lib/excalidrawImport';
import { useAppStore } from '../../store/appStore';
import {
  IconChatGPT,
  IconClaude,
  IconGemini,
  IconGrok,
} from './AiBrandIcons';
import {
  ExternalArtDialog,
  excalidrawAiTarget,
  openExternalArtOrGate,
  openExternalArtTarget,
  type ExternalArtSourceKey,
  type ExternalArtTarget,
} from './ExternalArtDialog';

export function ExcalidrawPanel() {
  const showToast = useAppStore((s) => s.showToast);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingExternal, setPendingExternal] = useState<ExternalArtTarget | null>(null);

  const requestOpenExternal = (key: ExternalArtSourceKey) => {
    openExternalArtOrGate(excalidrawAiTarget(key), setPendingExternal);
  };

  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(okMsg);
    } catch {
      showToast('Could not copy — select and copy manually');
    }
  };

  /** Read OS clipboard (Excalidraw.com puts type "excalidraw/clipboard" JSON as text). */
  const pasteFromSystemClipboard = async (andPlace: boolean) => {
    setBusy(true);
    try {
      let text = '';
      // Prefer full ClipboardItem read (images + text)
      try {
        if (navigator.clipboard?.read) {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            for (const type of item.types) {
              if (type === 'text/plain' || type === 'text' || type.includes('json')) {
                const blob = await item.getType(type);
                const t = await blob.text();
                if (t.trim()) text = t;
              } else if (type.startsWith('image/') && andPlace) {
                const blob = await item.getType(type);
                const dataUrl = await new Promise<string>((resolve, reject) => {
                  const r = new FileReader();
                  r.onload = () => resolve(String(r.result));
                  r.onerror = () => reject(r.error);
                  r.readAsDataURL(blob);
                });
                await placeExcalidrawCode(dataUrl);
                showToast('Pasted Excalidraw image onto canvas');
                return;
              }
            }
          }
        }
      } catch {
        /* fall through to readText */
      }
      if (!text && navigator.clipboard?.readText) {
        text = await navigator.clipboard.readText();
      }
      if (!text?.trim()) {
        showToast(
          'Clipboard empty or blocked. On excalidraw.com: select → ⌘/Ctrl+C, then try again (allow clipboard if prompted).',
        );
        return;
      }
      setCode(text);
      if (andPlace) {
        const kind = await placeExcalidrawCode(text);
        showToast(
          kind === 'excalidraw'
            ? 'Excalidraw figure placed on canvas'
            : 'Figure placed on canvas',
        );
      } else {
        showToast(
          looksLikeExcalidrawJson(text)
            ? 'Excalidraw clipboard loaded — click Place on canvas'
            : 'Clipboard text loaded into the box',
        );
      }
    } catch (e) {
      console.error(e);
      showToast(
        e instanceof Error
          ? e.message
          : 'Could not read clipboard — paste with ⌘/Ctrl+V into the box',
      );
    } finally {
      setBusy(false);
    }
  };

  const onGenerate = async () => {
    if (!code.trim()) {
      // Try system clipboard if box empty
      await pasteFromSystemClipboard(true);
      return;
    }
    setBusy(true);
    try {
      const kind = await placeExcalidrawCode(code);
      showToast(
        kind === 'excalidraw'
          ? 'Excalidraw figure placed on canvas'
          : 'SVG / image placed on canvas',
      );
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Could not place figure');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="ba-left-panel ba-excal-panel">
      <div className="ba-panel-header">
        <span className="ba-excal-title">
          <Pencil size={16} strokeWidth={1.75} />
          Excalidraw
        </span>
      </div>

      <div className="ba-excal-body">
        {/* ── Open AI ─────────────────────────────────────────────── */}
        <section className="ba-excal-block">
          <div className="ba-excal-block-label">Open AI</div>
          <div className="ba-ai-tool-links ba-excal-ai-links">
            <button
              type="button"
              className="ba-ai-brand-btn ba-ai-brand-btn--chatgpt"
              onClick={() => requestOpenExternal('chatgpt')}
            >
              <IconChatGPT /> ChatGPT
            </button>
            <button
              type="button"
              className="ba-ai-brand-btn ba-ai-brand-btn--claude"
              onClick={() => requestOpenExternal('claude')}
            >
              <IconClaude /> Claude
            </button>
            <button
              type="button"
              className="ba-ai-brand-btn ba-ai-brand-btn--gemini"
              onClick={() => requestOpenExternal('gemini')}
            >
              <IconGemini /> Gemini
            </button>
            <button
              type="button"
              className="ba-ai-brand-btn ba-ai-brand-btn--grok"
              onClick={() => requestOpenExternal('grok')}
            >
              <IconGrok /> Grok
            </button>
          </div>
          <a
            className="ba-excal-site-link"
            href="https://excalidraw.com"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={12} /> Open excalidraw.com
          </a>
        </section>

        {/* ── Prompts ─────────────────────────────────────────────── */}
        <section className="ba-excal-block">
          <div className="ba-excal-block-label">Copy example prompts</div>
          <div className="ba-ai-prompts ba-excal-prompts">
            {EXCALIDRAW_EXAMPLE_PROMPTS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="ba-ai-prompt-chip"
                title={p.prompt}
                onClick={() =>
                  void copyText(p.prompt, `“${p.label}” prompt copied — paste into AI`)
                }
              >
                <Copy size={11} /> {p.label}
              </button>
            ))}
          </div>
        </section>

        {/* ── Code ────────────────────────────────────────────────── */}
        <section className="ba-excal-block ba-excal-block--code">
          <div className="ba-excal-block-label">Paste from Excalidraw</div>
          <p className="ba-excal-hint">
            On <strong>excalidraw.com</strong>: select shapes → <kbd>⌘/Ctrl+C</kbd>. Then either
            paste into the canvas with <kbd>⌘/Ctrl+V</kbd>, or use the buttons below.
          </p>
          <div className="ba-excal-actions" style={{ marginBottom: 8 }}>
            <button
              type="button"
              className="ba-btn ba-btn-sm"
              disabled={busy}
              onClick={() => void pasteFromSystemClipboard(false)}
              title="Load clipboard into the box"
            >
              <ClipboardPaste size={14} /> Paste into box
            </button>
            <button
              type="button"
              className="ba-btn ba-btn-primary ba-btn-sm"
              disabled={busy}
              onClick={() => void pasteFromSystemClipboard(true)}
              title="Read clipboard and place on canvas immediately"
            >
              <Play size={14} /> {busy ? 'Working…' : 'Paste & place'}
            </button>
          </div>
          <textarea
            className="ba-excal-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onPaste={(e) => {
              // Ensure system paste lands in the box (and normalize)
              const text = e.clipboardData?.getData('text/plain');
              if (text?.trim()) {
                // default paste is fine; also try other mime types Excalidraw may use
                for (const t of e.clipboardData?.types || []) {
                  if (t === 'text/plain' || t === 'text/html') continue;
                  try {
                    const extra = e.clipboardData?.getData(t);
                    if (extra && looksLikeExcalidrawJson(extra)) {
                      e.preventDefault();
                      setCode(extra);
                      showToast('Excalidraw data loaded into the box');
                      return;
                    }
                  } catch {
                    /* ignore */
                  }
                }
              }
            }}
            placeholder={`Paste Excalidraw JSON here, or use “Paste & place”.\n\n{\n  "type": "excalidraw/clipboard",\n  "elements": [ ... ]\n}`}
            spellCheck={false}
            aria-label="Excalidraw JSON or SVG code"
          />
          <div className="ba-excal-actions">
            <button
              type="button"
              className="ba-btn ba-btn-primary ba-btn-sm"
              disabled={busy}
              onClick={() => void onGenerate()}
            >
              <Play size={14} /> {busy ? 'Placing…' : 'Place on canvas'}
            </button>
            <button
              type="button"
              className="ba-btn ba-btn-sm"
              disabled={!code}
              onClick={() => setCode('')}
              title="Clear box"
            >
              <Trash2 size={14} /> Clear
            </button>
          </div>
        </section>
      </div>

      <ExternalArtDialog
        target={pendingExternal}
        onCancel={() => setPendingExternal(null)}
        onApprove={(t) => {
          setPendingExternal(null);
          openExternalArtTarget(t);
          showToast(`Opened ${t.title} — paste a prompt, then paste JSON/SVG here`);
        }}
      />
    </aside>
  );
}
