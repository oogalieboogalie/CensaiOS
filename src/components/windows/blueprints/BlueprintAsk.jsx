/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';

// The ask box: "Do we have any budget blueprints?" Shows which phrase it
// caught and which words it looked for, the same way agents do in chat.
export function BlueprintAsk({ onAsk, busy, answer, onClear }) {
  const [question, setQuestion] = React.useState('');
  const submit = (event) => { event.preventDefault(); onAsk(question); };
  return (
    <form className="hb-bp-ask" onSubmit={submit}>
      <div className="hb-bp-ask-row">
        <Icon.Search size={13} />
        <input
          className="hb-bp-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder='Ask like you would an agent: "Do we have any budget blueprints?"'
          aria-label="Ask about blueprints"
        />
        <button type="submit" className="hb-bp-btn hb-bp-btn-primary" disabled={busy}>{busy ? 'Looking…' : 'Ask'}</button>
      </div>
      {answer && (
        <div className="hb-bp-caught">
          {answer.phrase ? <span>Caught <b className="hb-bp-phrase">"{answer.phrase}"</b></span> : <span>No phrase caught, searched the words</span>}
          <span>looking for {answer.words?.length ? answer.words.map((w) => <b key={w} className="hb-bp-word">{w}</b>) : <b className="hb-bp-word">everything</b>}</span>
          <span>{answer.matches?.length ? `${answer.matches.length} found` : 'none found'}</span>
          <button type="button" className="hb-bp-link" onClick={() => { setQuestion(''); onClear(); }}>Show the whole shelf</button>
        </div>
      )}
    </form>
  );
}
