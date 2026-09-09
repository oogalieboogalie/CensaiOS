import React from 'react';
import { Icon, ImageIcon, GenIcon } from '../Icons.jsx';
import {
  MODULE_MENU_MANIFESTS,
  WINDOW_MANIFEST_BY_KIND,
  isWindowVisibleInModuleMenu,
} from '../../lib/windowManifest.js';
import { DEFAULT_HTML_PREVIEW } from '../canvas/CanvasState.js';
import { useEscapeDismiss } from '../../lib/useEscapeDismiss.js';

// Icon per window kind. Only icons that actually exist in Icons.jsx are used;
// anything missing falls back to the generic NewWindow glyph.
const ICON_BY_KIND = {
  chat: <Icon.Chat size={14} />,
  groupChat: <Icon.Group size={14} />,
  agentDesigner: <Icon.NewAgent size={14} />,
  rook: <Icon.Bot size={14} />,
  exoSkeleton: <Icon.Bot size={14} />,
  todos: <Icon.List size={14} />,
  workflow: <Icon.NewWorkflow size={14} />,
  scheduler: <Icon.Calendar size={14} />,
  operationsBoard: <Icon.Tools size={14} />,
  julesTasks: <Icon.List size={14} />,
  calendar: <Icon.Calendar size={14} />,
  terminal: <Icon.Terminal size={14} />,
  code_editor: <Icon.Code size={14} />,
  files: <Icon.Files size={14} />,
  doc: <Icon.Files size={14} />,
  htmlPreview: <Icon.Eye size={14} />,
  browser: <Icon.Search size={14} />,
  genImage: <ImageIcon size={14} />,
  imageStudio: <ImageIcon size={14} />,
  idea: <GenIcon size={14} />,
  analyticsBoard: <Icon.Memory size={14} />,
  music: <Icon.Music size={14} />,
  stream: <Icon.Video size={14} />,
  mailcow: <Icon.Send size={14} />,
  vex: <GenIcon size={14} />,
  sovereignTest: <Icon.Search size={14} />,
};

// Default props for kinds that need a sensible seed when spawned from the menu.
const PROPS_BY_KIND = {
  chat: { agentId: 'censai' },
  terminal: { title: 'Terminal' },
  htmlPreview: { title: 'Shared Preview', fileName: 'preview.html', html: DEFAULT_HTML_PREVIEW },
  rook: { title: 'Rook Agent Control' },
  mailcow: { title: 'Mailcow' },
  vex: { title: 'Vex Orchestrator' },
};

// Kinds that are never spawned manually from this menu:
//  - agent: created via the agent designer / pink rail (needs a real agentId)
//  - group: created by rubber-banding a region on the canvas
//  - todo: legacy alias of `todos`
const EXCLUDED_KINDS = new Set(['agent', 'group', 'todo', 'generic', 'chrome']);

// Curated ordering / grouping. Any registered kind not listed here still shows
// up automatically under "More", so new windows never go button-less again.
const CATEGORIES = [
  { label: 'Chat & Agents', kinds: ['chat', 'groupChat', 'agentDesigner', 'rook', 'exoSkeleton'] },
  { label: 'Work', kinds: ['todos', 'workflow', 'scheduler', 'operationsBoard', 'julesTasks', 'calendar'] },
  { label: 'Build', kinds: ['terminal', 'code_editor', 'files', 'doc', 'htmlPreview', 'browser'] },
  { label: 'Create', kinds: ['genImage', 'imageStudio', 'idea', 'analyticsBoard'] },
  { label: 'Media', kinds: ['music', 'stream'] },
  { label: 'System', kinds: ['mailcow', 'vex', 'sovereignTest'] },
];

function buildSections() {
  const claimed = new Set();
  const sections = CATEGORIES.map((cat) => {
    const items = cat.kinds
      .filter((kind) => WINDOW_MANIFEST_BY_KIND[kind] && isWindowVisibleInModuleMenu(WINDOW_MANIFEST_BY_KIND[kind]) && !EXCLUDED_KINDS.has(kind))
      .map((kind) => {
        claimed.add(kind);
        return { kind, label: WINDOW_MANIFEST_BY_KIND[kind].label };
      });
    return { label: cat.label, items };
  }).filter((s) => s.items.length > 0);

  const leftovers = MODULE_MENU_MANIFESTS
    .filter((m) => !claimed.has(m.kind) && !EXCLUDED_KINDS.has(m.kind))
    .map((m) => ({ kind: m.kind, label: m.label }));

  if (leftovers.length) sections.push({ label: 'More', items: leftovers });
  return sections;
}

const SECTIONS = buildSections();

function MenuItem({ label, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ all: 'unset', boxSizing: 'border-box', width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ color: 'var(--ink-faint)', display: 'inline-flex' }}>{icon || <Icon.NewWindow size={14} />}</span>
      {label}
    </button>
  );
}

export function WindowMenu({ onSpawn }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  useEscapeDismiss(menuOpen, () => setMenuOpen(false));

  const spawn = (kind) => {
    onSpawn?.(kind, PROPS_BY_KIND[kind] || {});
    setMenuOpen(false);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        data-mission="module-menu"
        title="Add a module to the canvas"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((s) => !s)}
        style={{ all: 'unset', cursor: 'pointer', padding: '4px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-soft)', background: menuOpen ? 'var(--surface-2)' : 'transparent' }}
      >
        <img src="/assets/logolite.png" alt="" style={{ height: 28, width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 1px 3px rgba(8,16,216,0.1))' }} />
        Modules
      </button>

      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
          <div
            data-canvas-ui
            role="menu"
            style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 70, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 12, padding: 6, minWidth: 240, maxHeight: 460, overflowY: 'auto', boxShadow: 'var(--shadow-pop)' }}
          >
            {SECTIONS.map((section, i) => (
              <div key={section.label}>
                <div style={{ padding: i === 0 ? '4px 10px 2px' : '8px 10px 2px', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                  {section.label}
                </div>
                {section.items.map((item) => (
                  <MenuItem
                    key={item.kind}
                    label={item.label}
                    icon={ICON_BY_KIND[item.kind]}
                    onClick={() => spawn(item.kind)}
                  />
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
