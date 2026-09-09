import React from 'react';
import { AgentAvatar } from '../../Agents.jsx';
import { Icon } from '../../Icons.jsx';
import { isBroadLocalScope } from './toolkits.js';
import {
  darkInputStyle, sectionTitleStyle, chipBoxStyle, selectedChipStyle,
  toolSearchStyle, catalogStyle, categoryTitleStyle, toolGridStyle,
  toolButtonStyle, scopeStyle, listStyle, nodeStyle, nodeHeaderStyle,
  nodeBodyStyle, nodeToolRowStyle, segmentedStyle, segmentStyle,
  dotStyle, nodeToolDotStyle,
} from './styles.js';

export function Field({ label, count, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, fontWeight: 800, color: 'var(--ink)' }}>
        <span>{label}</span>
        {count && <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{count}</span>}
      </span>
      {children}
    </label>
  );
}

export function Segmented({ value, options, onChange }) {
  return (
    <div style={segmentedStyle}>
      {options.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)} style={{
          ...segmentStyle,
          background: value === id ? 'var(--accent)' : 'transparent',
          color: value === id ? 'white' : 'var(--ink-soft)',
        }}>{label}</button>
      ))}
    </div>
  );
}

export function ColorPicker({ hue, setHue }) {
  return (
    <Field label="Accent">
      <div style={{ position: 'relative', height: 22, background: 'linear-gradient(to right, oklch(0.7 0.16 0), oklch(0.7 0.16 60), oklch(0.7 0.16 120), oklch(0.7 0.16 180), oklch(0.7 0.16 240), oklch(0.7 0.16 300), oklch(0.7 0.16 360))', borderRadius: 999, cursor: 'pointer' }}
        onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setHue(Math.round(((e.clientX - r.left) / r.width) * 360)); }}>
        <div style={{ position: 'absolute', left: `${(hue / 360) * 100}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 16, height: 16, borderRadius: '50%', background: `oklch(0.72 0.16 ${hue})`, boxShadow: '0 0 0 2px var(--surface), 0 0 0 3px var(--hairline-strong)', pointerEvents: 'none' }} />
      </div>
    </Field>
  );
}

export function ScopePanel({ githubRepos, setGithubRepos, localPaths, setLocalPaths }) {
  return (
    <div style={scopeStyle}>
      <div style={sectionTitleStyle}>Scopes</div>
      <Field label="GitHub repos">
        <textarea value={githubRepos} onChange={e => setGithubRepos(e.target.value)} placeholder="owner/repo, owner/another-repo" style={{ ...darkInputStyle, minHeight: 54, resize: 'vertical' }} />
      </Field>
      <Field label="Local paths">
        <textarea value={localPaths} onChange={e => setLocalPaths(e.target.value)} placeholder={'src/components, server/routes, C:\\ProjectX\\*'} style={{ ...darkInputStyle, minHeight: 54, resize: 'vertical' }} />
        {isBroadLocalScope(localPaths) && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>
            Broad file-system access (e.g. C:\*) lets this agent read/write the whole drive. Grant only if you mean it.
          </span>
        )}
      </Field>
    </div>
  );
}

export function ToolCategory({ category, selectedTools, toggleTool }) {
  return (
    <div>
      <div style={categoryTitleStyle}>{category.label}</div>
      <div style={toolGridStyle}>
        {category.tools.map(tool => {
          const selected = selectedTools.includes(tool.name);
          return (
            <button key={tool.name} onClick={() => toggleTool(tool.name)} title={tool.description} style={{
              ...toolButtonStyle,
              borderColor: selected ? 'var(--accent)' : 'var(--hairline)',
              background: selected ? 'var(--accent-soft)' : 'var(--surface-2)',
            }}>
              <span style={dotStyle(tool.category)} />
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tool.label}</span>
              <span style={{ marginLeft: 'auto', color: selected ? 'var(--accent)' : 'var(--ink-faint)' }}>{selected ? 'On' : '+'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AgentRow({ agent, selected, onClick }) {
  return (
    <button onClick={onClick} style={{
      all: 'unset',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '7px 8px',
      borderRadius: 8,
      background: selected ? 'var(--accent-soft)' : 'var(--surface-2)',
      border: `1px solid ${selected ? 'var(--accent)' : 'var(--hairline)'}`,
      color: 'var(--ink)',
    }}>
      <AgentAvatar agent={agent} size={24} />
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.name}</span>
        <span style={{ fontSize: 10.5, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.role}</span>
      </span>
    </button>
  );
}

export function GroupSelectionList({ groups, groupIds, toggleGroup }) {
  return (
    <div style={listStyle}>
      {groups.map(group => {
        const selected = groupIds.includes(group.id);
        return (
          <button key={group.id} onClick={() => toggleGroup(group.id)} style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '7px 9px',
            borderRadius: 8,
            background: selected ? 'var(--accent-soft)' : 'var(--surface-2)',
            border: `1px solid ${selected ? 'var(--accent)' : 'var(--hairline)'}`,
            color: 'var(--ink)',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</span>
            <span style={{ width: 16, height: 16, borderRadius: '50%', display: 'grid', placeItems: 'center', background: selected ? 'var(--accent)' : 'transparent', color: selected ? 'var(--accent-ink)' : 'var(--ink-faint)', boxShadow: selected ? 'none' : 'inset 0 0 0 1px var(--hairline)' }}>
              {selected && <Icon.Check size={10} stroke={2.4} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function AgentNode({ agent, title, body, hue, primary, tools }) {
  return (
    <div style={{ ...nodeStyle, borderColor: primary ? `oklch(0.62 0.15 ${hue})` : 'var(--hairline)' }}>
      <div style={{ ...nodeHeaderStyle, background: primary ? `oklch(0.44 0.16 ${hue})` : `oklch(0.34 0.16 ${hue})` }}>
        <AgentAvatar agent={agent} size={18} />
        <span>{title}</span>
      </div>
      <div style={nodeBodyStyle}>{body || 'No information added'}</div>
      <div style={nodeToolRowStyle}>
        {tools.length ? tools.map(tool => <span key={tool.name} title={tool.label} style={nodeToolDotStyle(tool.category)} />) : <span style={{ color: 'var(--ink-soft)' }}>No tools</span>}
      </div>
    </div>
  );
}

export function ToolChipBar({ selectedToolRows, toggleTool, toolSearch, setToolSearch }) {
  return (
    <div style={chipBoxStyle}>
      {selectedToolRows.map(tool => (
        <button key={tool.name} onClick={() => toggleTool(tool.name)} title={tool.description} style={selectedChipStyle}>
          <span style={dotStyle(tool.category)} />
          {tool.label}
          <span style={{ color: 'var(--ink-soft)' }}>x</span>
        </button>
      ))}
      <input value={toolSearch} onChange={e => setToolSearch(e.target.value)} placeholder="Search available tools" style={toolSearchStyle} />
    </div>
  );
}

export function ToolCatalog({ filteredCategories, selectedTools, toggleTool }) {
  return (
    <div style={catalogStyle}>
      {filteredCategories.map(category => (
        <ToolCategory key={category.id} category={category} selectedTools={selectedTools} toggleTool={toggleTool} />
      ))}
    </div>
  );
}
