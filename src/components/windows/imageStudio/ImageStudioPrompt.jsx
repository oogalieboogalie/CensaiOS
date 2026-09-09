import React from 'react';
import { IMAGE_STUDIO_MODELS } from './constants.js';

export function ImageStudioPrompt({
  state,
  updateFields,
  loading,
  error,
  onGenerate,
}) {
  const [expanded, setExpanded] = React.useState(Boolean(state.additionalInstructions));

  return (
    <section style={{ display: 'grid', gap: 8, paddingTop: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={state.prompt}
          onChange={event => updateFields({ prompt: event.target.value })}
          placeholder="Describe your image ..."
          style={{ flex: 1, minWidth: 0, background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: 'var(--ink)', borderRadius: 10, padding: '9px 11px', fontSize: 13 }}
        />
        <select
          aria-label="Image generation model"
          value={state.model}
          onChange={event => updateFields({ model: event.target.value })}
          style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: 'var(--ink)', borderRadius: 10, padding: '0 8px', fontSize: 12 }}
        >
          {IMAGE_STUDIO_MODELS.map(model => (
            <option key={model.id} value={model.id}>{model.label}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={loading || !state.prompt.trim()}
          onClick={onGenerate}
          style={{ all: 'unset', cursor: loading ? 'wait' : 'pointer', borderRadius: 10, padding: '0 14px', background: 'var(--accent)', color: 'white', fontWeight: 800, fontSize: 12, opacity: loading || !state.prompt.trim() ? 0.55 : 1 }}
        >
          {loading ? 'Generating' : 'Generate'}
        </button>
      </div>
      <button
        type="button"
        onClick={() => setExpanded(open => !open)}
        style={{ all: 'unset', cursor: 'pointer', color: 'var(--ink-faint)', font: '700 10px var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}
      >
        Additional Instructions
      </button>
      {expanded && (
        <textarea
          value={state.additionalInstructions}
          onChange={event => updateFields({ additionalInstructions: event.target.value })}
          rows={2}
          placeholder="Style, constraints, composition notes, or what to avoid."
          style={{ resize: 'vertical', background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: 'var(--ink)', borderRadius: 10, padding: 10, fontSize: 12, fontFamily: 'var(--font-sans)' }}
        />
      )}
      {error && <div style={{ color: 'var(--ps-red)', fontSize: 12 }}>{error}</div>}
    </section>
  );
}
