/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { KnowledgeSources } from '../../chat/KnowledgeSources.jsx';

export function AskPanel({ research }) {
  const { asks, kb, busy, readOnly } = research;
  const [question, setQuestion] = React.useState('');
  const submit = async (event) => {
    event.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    if (await research.ask(q)) setQuestion('');
  };
  return (
    <div className="hb-rs-panel">
      {!readOnly && (
        <form className="hb-rs-searchbox" onSubmit={submit}>
          <Icon.Chat size={14} />
          <input className="hb-rs-input" value={question} onChange={(e) => setQuestion(e.target.value)}
            placeholder={kb.length ? 'Ask over this board’s knowledge base' : 'Ask anything; nothing saved yet, so it searches the web'}
            aria-label="Ask a question" />
          <button type="submit" className="hb-lh-pill" data-primary="true" disabled={busy === 'ask' || !question.trim()}>
            {busy === 'ask' ? 'Thinking…' : 'Ask'}
          </button>
        </form>
      )}
      {asks.length === 0 && <div className="hb-rs-empty"><p>Answers cite the saved pages they came from.</p></div>}
      <div className="hb-rs-asks">
        {asks.map((a) => (
          <article key={a.id} className="hb-rs-ask">
            <div className="hb-rs-ask-q">{a.question}</div>
            <div className="hb-rs-ask-a">{a.answer}</div>
            <div className="hb-rs-meta">
              {a.by && <span>{a.by}</span>}
              {a.usedWeb && <span>from a live web search</span>}
            </div>
            <KnowledgeSources sources={a.sources} />
          </article>
        ))}
      </div>
    </div>
  );
}
