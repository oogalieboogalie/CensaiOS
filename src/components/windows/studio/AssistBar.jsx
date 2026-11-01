/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { MAX_PROMPT } from '../../../lib/studio/assist.js';

// The prompt box under the timeline: names the track it works on, takes a
// request in plain words, and shows what the model did with an Undo.

const IDEAS = {
  audio: 'Build a gritty delay and put it on this track',
  synth: 'Write a four bar bassline in the song key',
  master: 'Make the whole mix warmer and a bit louder',
};

const sentence = list => list.join(', ').replace(/^./, c => c.toUpperCase());

export function AssistBar({ assist, target }) {
  const [text, setText] = React.useState('');
  const { busy, answer } = assist;
  const send = async () => { if (await assist.ask(text)) setText(''); };
  return (
    <div className="hb-studio-assist" data-no-drag data-testid="studio-assist">
      <div className="hb-studio-assist-row">
        <span className="hb-studio-assist-target" data-color={target.color} title="The model works on the selected track. Click a track header to change it.">
          {target.name}
        </span>
        <input className="hb-studio-assist-input" value={text} maxLength={MAX_PROMPT} disabled={busy}
          placeholder={IDEAS[target.kind] || IDEAS.audio} aria-label="Ask your model to change this track"
          onChange={e => setText(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') send(); }} />
        <button type="button" className="hb-studio-chip" data-primary="true" onClick={send} disabled={busy || !text.trim()} data-testid="studio-assist-send">
          {busy ? 'Thinking...' : 'Ask'}
        </button>
      </div>
      {answer && (
        <div className="hb-studio-assist-answer" role="status" data-error={answer.error ? 'true' : undefined}>
          <span>
            {answer.error || [answer.say, answer.done?.length ? `${sentence(answer.done)}.` : 'Nothing changed.'].filter(Boolean).join(' ')}
            {answer.undone ? ' Undone.' : ''}
            {answer.model ? <span className="hb-studio-hint"> · {answer.model}</span> : null}
          </span>
          {answer.before && <button type="button" className="hb-studio-link" onClick={assist.undo}>Undo</button>}
          <button type="button" className="hb-studio-link" onClick={assist.dismiss} aria-label="Hide the answer">Hide</button>
        </div>
      )}
    </div>
  );
}
