import React from 'react';
import { IMAGE_STUDIO_MODELS } from './constants.js';
import { useSharedCaret } from '../../../lib/collaboration/useSharedCaret.js';
import { useCaretReporter, useTeammateCarets } from '../../../lib/collaboration/useTextCarets.js';
import { TeammateCarets } from '../../collaboration/TeammateCarets.jsx';
import { ImageStudioWhoTypedButton, ImageStudioWhoTypedPane } from './ImageStudioWhoTyped.jsx';

const BUTTONS = { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' };

export function ImageStudioPrompt({
  winId,
  state,
  words,
  updateFields,
  loading,
  error,
  onGenerate,
}) {
  const [expanded, setExpanded] = React.useState(Boolean(words.notes));
  // A teammate's letters landing in either box keep your cursor where it was.
  const promptRef = React.useRef(null);
  const notesRef = React.useRef(null);
  useSharedCaret(promptRef, words.prompt, React.useMemo(() => ({ id: winId, field: 'prompt' }), [winId]));
  useSharedCaret(notesRef, words.notes, React.useMemo(() => ({ id: winId, field: 'imageNotes' }), [winId]));
  // Teammates' cursors in both boxes, with their names, and ours for them.
  // "Who typed what" puts both boxes away; ours goes out again once back.
  const [writersOn, setWritersOn] = React.useState(false);
  useCaretReporter(promptRef, winId, 'prompt', !writersOn);
  useCaretReporter(notesRef, winId, 'imageNotes', expanded && !writersOn);
  const promptCarets = useTeammateCarets(winId, 'prompt');
  const notesCarets = useTeammateCarets(winId, 'imageNotes', expanded);

  const empty = !words.prompt.trim();

  return (
    <section className="hb-is-prompt">
      <div className="hb-is-row">
        {writersOn && <ImageStudioWhoTypedPane windowId={winId} field="prompt" label="prompt" />}
        {!writersOn && <div className="hb-is-box hb-is-box-main">
          <input
            ref={promptRef}
            aria-label="Image prompt"
            value={words.prompt}
            onChange={event => words.setPrompt(event.target.value)}
            placeholder="Describe your image ..."
            className="hb-is-input hb-is-input-main"
          />
          <TeammateCarets boxRef={promptRef} carets={promptCarets} text={words.prompt} />
        </div>}
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
      <div style={BUTTONS}>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(open => !open)}
          className="hb-is-more"
        >
          Additional Instructions
        </button>
        <ImageStudioWhoTypedButton on={writersOn} onToggle={() => setWritersOn(on => !on)} />
      </div>
      {expanded && writersOn && <ImageStudioWhoTypedPane windowId={winId} field="imageNotes" label="additional instructions" />}
      {expanded && !writersOn && (
        <div className="hb-is-box">
          <textarea
            ref={notesRef}
            aria-label="Additional instructions"
            value={words.notes}
            onChange={event => words.setNotes(event.target.value)}
            rows={2}
            placeholder="Style, constraints, composition notes, or what to avoid."
            className="hb-is-input hb-is-notes"
          />
          <TeammateCarets boxRef={notesRef} carets={notesCarets} text={words.notes} />
        </div>
      )}
      {error && <div className="hb-is-error">{error}</div>}
    </section>
  );
}
