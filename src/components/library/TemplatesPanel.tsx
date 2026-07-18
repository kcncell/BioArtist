import {
  Bot,
  Copy,
  Library,
  Pin,
  PinOff,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyBuiltinTemplate,
  applyUserTemplate,
  BUILTIN_TEMPLATES,
  MCP_TEMPLATE_PROMPTS,
  parseTemplateFile,
  sortTemplatesByPin,
  type BuiltinTemplate,
} from '../../lib/templates';
import { useAppStore } from '../../store/appStore';
import type { UserTemplate } from '../../types';
import { ContextMenu } from '../ui/ContextMenu';

type ListItem =
  | { kind: 'builtin'; item: BuiltinTemplate }
  | { kind: 'user'; item: UserTemplate };

export function TemplatesPanel() {
  const showToast = useAppStore((s) => s.showToast);
  const setTool = useAppStore((s) => s.setTool);
  const setLibraryTab = useAppStore((s) => s.setLibraryTab);
  const userTemplates = useAppStore((s) => s.userTemplates);
  const pinnedTemplateIds = useAppStore((s) => s.pinnedTemplateIds);
  const addUserTemplate = useAppStore((s) => s.addUserTemplate);
  const removeUserTemplate = useAppStore((s) => s.removeUserTemplate);
  const togglePinTemplate = useAppStore((s) => s.togglePinTemplate);
  const setArtboardSize = useAppStore((s) => s.setArtboardSize);
  const setProjectName = useAppStore((s) => s.setProjectName);

  const fileRef = useRef<HTMLInputElement>(null);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    id: string;
    kind: 'builtin' | 'user';
    name: string;
  } | null>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);

  const list = useMemo(() => {
    const builtins: ListItem[] = BUILTIN_TEMPLATES.map((item) => ({
      kind: 'builtin' as const,
      item,
    }));
    const users: ListItem[] = userTemplates.map((item) => ({
      kind: 'user' as const,
      item,
    }));
    // Imported first within unpinned; pins float to top
    const combined = [...users, ...builtins];
    return sortTemplatesByPin(combined, pinnedTemplateIds, (row) => row.item.id);
  }, [userTemplates, pinnedTemplateIds]);

  const goLibrary = () => {
    setTool('library');
    setLibraryTab('library');
  };

  const applyItem = async (row: ListItem) => {
    try {
      if (row.kind === 'builtin') {
        await applyBuiltinTemplate(row.item);
        showToast(`Loaded “${row.item.name}”`);
        return;
      }
      const t = row.item;
      if (t.project.artboard) {
        setArtboardSize(t.project.artboard.width, t.project.artboard.height);
      }
      if (t.project.projectName) {
        setProjectName(t.project.projectName);
      }
      await applyUserTemplate(t);
      showToast(`Loaded “${t.name}”`);
    } catch (err) {
      console.error(err);
      showToast('Could not load template');
    }
  };

  const onImportFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    let ok = 0;
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const parsed = parseTemplateFile(text, file.name);
        const template: UserTemplate = {
          id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: new Date().toISOString(),
          ...parsed,
        };
        await addUserTemplate(template);
        ok += 1;
      } catch (err) {
        console.error(err);
        showToast(`Could not import ${file.name}`);
      }
    }
    if (ok) showToast(ok === 1 ? 'Template imported' : `${ok} templates imported`);
  };

  const copyPrompt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Prompt copied — paste into Claude, Codex, or Grok');
    } catch {
      showToast('Could not copy — select and copy manually');
    }
  };

  const isPinned = (id: string) => pinnedTemplateIds.includes(id);

  return (
    <aside className="ba-left-panel">
      <div className="ba-panel-header">Templates</div>
      <div style={{ padding: '0 12px 10px' }}>
        <button className="ba-btn" style={{ width: '100%' }} onClick={goLibrary}>
          <Library size={14} /> Back to icon library
        </button>
      </div>

      <div className="ba-panel-sub">
        Click a template to load it on the canvas. Right-click to pin or delete. Import a saved
        .ba figure, or generate icons via desktop AI (MCP).
      </div>

      <div className="ba-tpl-actions">
        <button
          className="ba-btn ba-btn-primary ba-btn-sm"
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={14} /> Import template
        </button>
        <button className="ba-btn ba-btn-sm" onClick={() => setMcpOpen(true)}>
          <Sparkles size={14} /> MCP / AI tools
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".ba,.bioartist,.json,application/json"
        multiple
        hidden
        onChange={(e) => {
          void onImportFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <div className="ba-template-list" style={{ padding: '0 12px 16px' }}>
        {list.length === 0 && (
          <div className="ba-empty">No templates yet. Import a .ba project or use built-ins.</div>
        )}
        {list.map((row) => {
          const id = row.item.id;
          const name = row.item.name;
          const description = row.item.description;
          const sourceLabel =
            row.kind === 'builtin' ? 'Built-in' : row.item.source === 'mcp' ? 'MCP' : 'Imported';
          const pinned = isPinned(id);
          return (
            <button
              key={id}
              type="button"
              className={`ba-template-btn ${pinned ? 'pinned' : ''}`}
              title={`${description} · right-click for options`}
              onClick={() => void applyItem(row)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCtxMenu({
                  x: e.clientX,
                  y: e.clientY,
                  id,
                  kind: row.kind,
                  name,
                });
              }}
            >
              <div className="ba-template-btn-row">
                <strong>
                  {pinned && <Pin size={11} className="ba-template-pin-icon" aria-hidden />}
                  {name}
                </strong>
                <span className="ba-template-source">{sourceLabel}</span>
              </div>
              <span>{description}</span>
            </button>
          );
        })}
      </div>

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y}>
          <button
            type="button"
            onClick={() => {
              const row = list.find((r) => r.item.id === ctxMenu.id);
              if (row) void applyItem(row);
              setCtxMenu(null);
            }}
          >
            Load template
          </button>
          <button
            type="button"
            onClick={() => {
              togglePinTemplate(ctxMenu.id);
              showToast(
                isPinned(ctxMenu.id) ? `Unpinned “${ctxMenu.name}”` : `Pinned “${ctxMenu.name}”`,
              );
              setCtxMenu(null);
            }}
          >
            {isPinned(ctxMenu.id) ? (
              <>
                <PinOff size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                Unpin
              </>
            ) : (
              <>
                <Pin size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                Pin to top
              </>
            )}
          </button>
          {ctxMenu.kind === 'user' ? (
            <button
              type="button"
              className="danger"
              onClick={() => {
                removeUserTemplate(ctxMenu.id);
                showToast(`Deleted “${ctxMenu.name}”`);
                setCtxMenu(null);
              }}
            >
              <Trash2 size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
              Delete template
            </button>
          ) : (
            <button type="button" disabled title="Built-in templates stay in the catalog">
              Built-in (can’t delete)
            </button>
          )}
        </ContextMenu>
      )}

      {mcpOpen && (
        <div className="ba-modal-backdrop" onClick={() => setMcpOpen(false)}>
          <div
            className="ba-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(520px, 94vw)', maxHeight: '85vh', overflow: 'auto' }}
          >
            <h3>
              <Bot size={18} style={{ verticalAlign: -3, marginRight: 6 }} />
              MCP / AI template tools
            </h3>
            <p>
              Call your desktop AI (Claude Desktop, Codex, Cursor, or Grok) with the BioArtist MCP
              server connected. Copy a prompt below, run it in the AI app, then use{' '}
              <strong>My Library → Sync MCP inbox</strong> to pull generated icons and assemble a
              figure. Save the figure as a <code>.ba</code> project and use{' '}
              <strong>Import template</strong> here.
            </p>
            <div className="ba-mcp-prompt-list">
              {MCP_TEMPLATE_PROMPTS.map((p) => (
                <div key={p.id} className="ba-mcp-prompt-card">
                  <div className="ba-mcp-prompt-head">
                    <strong>{p.label}</strong>
                    <span className="ba-template-source">{p.tool}</span>
                  </div>
                  <pre className="ba-mcp-prompt-text">{p.prompt}</pre>
                  <button
                    type="button"
                    className="ba-btn ba-btn-sm"
                    onClick={() => void copyPrompt(p.prompt)}
                  >
                    <Copy size={13} /> Copy prompt
                  </button>
                </div>
              ))}
            </div>
            <p className="ba-panel-sub" style={{ padding: '8px 0 0' }}>
              Setup: <code>npm run mcp:install</code> then point Claude / Codex / Grok at{' '}
              <code>mcp-server/src/index.js</code>. See <code>docs/MCP.md</code>.
            </p>
            <div className="ba-modal-actions">
              <button className="ba-btn ba-btn-primary" onClick={() => setMcpOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
