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

  const empty = !state.prompt.trim();

  return (
    <section className="hb-is-prompt">
      <div className="hb-is-row">
        <input
          value={state.prompt}
          onChange={event => updateFields({ prompt: event.target.value })}
          placeholder="Describe your image ..."
          className="hb-is-input hb-is-input-main"
        />
        <select
          aria-label="Image generation model"
          value={state.model}
          onChange={event => updateFields({ model: event.target.value })}
          className="hb-is-input hb-is-select"
        >
          {IMAGE_STUDIO_MODELS.map(model => (
            <option key={model.id} value={model.id}>{model.label}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={loading || empty}
          aria-busy={loading || undefined}
          onClick={onGenerate}
          className="hb-is-go"
        >
          {loading ? 'Generating' : 'Generate'}
        </button>
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(open => !open)}
        className="hb-is-more"
      >
        Additional Instructions
      </button>
      {expanded && (
        <textarea
          value={state.additionalInstructions}
          onChange={event => updateFields({ additionalInstructions: event.target.value })}
          rows={2}
          placeholder="Style, constraints, composition notes, or what to avoid."
          className="hb-is-input hb-is-notes"
        />
      )}
      {error && <div className="hb-is-error">{error}</div>}
    </section>
  );
}
