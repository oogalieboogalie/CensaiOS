import React from 'react';
import { keysNeeded } from '../../../lib/agentImport/index.js';
import { primaryBtnStyle } from './styles.js';

// One imported agent in the Import panel: what carried over, what did not,
// and which key it needs. Split out of ImportAgentPanel.jsx (size budget).

const KEY_LABELS = {
  google: 'Google Gemini', openai: 'OpenAI', anthropic: 'Anthropic (Claude)', xai: 'xAI (Grok)',
  elevenlabs: 'ElevenLabs', openrouter: 'OpenRouter', cohere: 'Cohere', moonshot: 'Moonshot', opencode: 'OpenCode Zen', zai: 'Z.ai (GLM)',
};

const cardStyle = {
  display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 'var(--radius-xl)',
  border: '1px solid var(--hairline)', background: 'var(--surface)',
};
const labelStyle = { fontSize: 'var(--text-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 850 };
const listItemStyle = { fontSize: 'var(--text-sm)', color: 'var(--ink)', lineHeight: 1.4 };

export function ImportCard({ agent, savedKeys, onImport, state }) {
  const needed = keysNeeded(agent);
  const missing = savedKeys ? needed.filter(key => !savedKeys.has(key)) : [];
  const preview = agent.instructions.split('\n').slice(0, 6).join('\n');
  return (
    <div style={cardStyle} data-testid="import-card">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={labelStyle}>From {agent.platformLabel}</div>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 850, color: 'var(--ink)' }} data-testid="import-card-name">{agent.name}</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
            Runs on {agent.providerLabel} · {agent.model || 'board default'}
            {agent.voice ? ' · speaks with its ElevenLabs voice' : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onImport(agent)}
          disabled={state === 'saving' || state === 'done'}
          style={{ ...primaryBtnStyle, opacity: state === 'saving' || state === 'done' ? 0.6 : 1, flex: '0 0 auto' }}
          data-testid="import-card-button"
        >
          {state === 'done' ? 'Imported' : state === 'saving' ? 'Importing...' : 'Import as agent'}
        </button>
      </div>

      {agent.description && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)' }}>{agent.description}</div>}
      {preview && (
        <pre style={{ margin: 0, padding: 10, borderRadius: 'var(--radius-lg)', background: 'var(--surface-2)', border: '1px solid var(--hairline)', whiteSpace: 'pre-wrap', font: '12px/1.45 var(--font-mono, monospace)', color: 'var(--ink)', maxHeight: 120, overflow: 'auto' }}>
          {preview}
        </pre>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div data-testid="import-carried">
          <div style={{ ...labelStyle, color: 'var(--success)' }}>Came across</div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {agent.carried.map(item => <li key={item} style={listItemStyle}>{item}</li>)}
          </ul>
        </div>
        <div data-testid="import-not-carried">
          <div style={{ ...labelStyle, color: 'var(--warning)' }}>Did not come across</div>
          {agent.notCarried.length === 0
            ? <div style={{ ...listItemStyle, marginTop: 6, color: 'var(--ink-soft)' }}>Nothing. Everything in the file carried over.</div>
            : (
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {agent.notCarried.map(item => <li key={item.name} style={listItemStyle}><b>{item.name}</b>: {item.why}</li>)}
              </ul>
            )}
        </div>
      </div>

      {missing.length > 0 && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--warning)' }} data-testid="import-missing-keys">
          To talk, it needs your {missing.map(key => KEY_LABELS[key] || key).join(' and ')} key. Add it in Settings → Vault; you can import now and add the key after.
        </div>
      )}
    </div>
  );
}

/**
 * Import agent: paste or drop an agent from Google ADK, OpenAI, Claude, Grok
 * or ElevenLabs, see what carries over, and save it as a board agent.
 */
