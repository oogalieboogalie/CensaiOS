/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { roleName } from '../../../lib/legion/legionState.js';

function Questions({ questions, onAnswer }) {
  const [text, setText] = React.useState('');
  return (
    <form className="hb-legion-questions" aria-label="The team's questions"
      onSubmit={(e) => { e.preventDefault(); if (text.trim()) onAnswer(text); }}>
      <strong>The Architect has questions before building</strong>
      <ol>{questions.map((q) => <li key={q}>{q}</li>)}</ol>
      <textarea className="hb-legion-input" rows={2} value={text} aria-label="Your answers"
        placeholder="Answer here, or let the team decide" onChange={(e) => setText(e.target.value)} />
      <div className="hb-legion-row">
        <button type="submit" className="hb-btn" data-primary="true" disabled={!text.trim()}>Send answers</button>
        <button type="button" className="hb-btn" data-variant="ghost" onClick={() => onAnswer('')}>Let the team decide</button>
      </div>
    </form>
  );
}

const ENOUGH = { now: 'YES · now', more: 'YES · if I knew more', learn: 'NO' };

/** One step of the self-educate loop. */
function Educate({ item }) {
  if (item.step === 'check') {
    return (
      <div className="hb-legion-text hb-legion-educate">
        <strong>{item.job} · Self-educate</strong>
        <dl>
          <dt>What is the problem</dt><dd>{item.problem || '-'}</dd>
          <dt>What do I know about it</dt><dd>{item.know || '-'}</dd>
          <dt>Is it enough</dt><dd><span className="hb-legion-verdict" data-verdict={item.enough ? 'OK' : 'NOK'}>{ENOUGH[item.when] || 'YES'}</span></dd>
        </dl>
      </div>
    );
  }
  if (item.step === 'memory') {
    return (
      <p className="hb-legion-text">
        <strong>{item.job} · Search long-term memory</strong>: {item.found?.length ? item.found.join(' / ') : 'nothing on this yet.'}
      </p>
    );
  }
  return (
    <div className="hb-legion-text">
      <strong>{item.job} · Research (Educate Self)</strong>{item.web ? ` · ${item.web} web results` : ''}
      <p className="hb-legion-question">{item.question}</p>
      <p>{item.answer || 'No answer.'}</p>
    </div>
  );
}

function Item({ item }) {
  if (item.kind === 'note') return <li className="hb-legion-note">{item.text}</li>;
  const who = roleName(item.role);
  let body = null;
  if (item.kind === 'say') body = <p className="hb-legion-text">{item.text}</p>;
  else if (item.kind === 'files') {
    body = (
      <p className="hb-legion-text">
        {item.job ? `${item.job}: ` : ''}{item.label === 'fix' ? 'Fixed' : 'Built'} {item.files.length ? item.files.join(', ') : 'nothing'}{item.notes ? `. ${item.notes}` : ''}
      </p>
    );
  } else if (item.kind === 'verdict') {
    body = (
      <div className="hb-legion-text">
        <span className="hb-legion-verdict" data-verdict={item.verdict}>{item.verdict}</span> {item.summary}
        {item.todo.length > 0 && (
          <ul className="hb-legion-todo" aria-label="To-do">
            {item.todo.map((t, i) => (
              <li key={i}><strong>{t.job ? `${t.job} ` : ''}{roleName(t.owner)}</strong>: {t.problem}{t.file ? <code> {t.file}{t.line ? `:${t.line}` : ''}</code> : null}</li>
            ))}
          </ul>
        )}
      </div>
    );
  } else if (item.kind === 'educate') {
    body = <Educate item={item} />;
  } else if (item.kind === 'fixes') {
    body = (
      <div className="hb-legion-text">
        <strong>Fixing instructions</strong>
        <ul className="hb-legion-todo">{Object.entries(item.fixes).map(([role, text]) => <li key={role}><strong>{roleName(role)}</strong>: {text}</li>)}</ul>
      </div>
    );
  }
  return (
    <li className="hb-legion-msg" data-role={item.role}>
      <span className="hb-legion-avatar" aria-hidden="true">{who.slice(0, 1)}</span>
      <div className="hb-legion-bubble"><span className="hb-legion-who">{who}</span>{body}</div>
    </li>
  );
}

/** The team chat: everything every agent said, in order. */
export function LegionFeed({ state, onAnswer }) {
  const end = React.useRef(null);
  React.useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [state.feed.length, state.questions.length]);
  return (
    <section className="hb-legion-feed" aria-label="Team chat">
      <ul className="hb-legion-msgs">
        {state.feed.map((item, i) => <Item key={i} item={item} />)}
      </ul>
      {state.questions.length > 0 && <Questions questions={state.questions} onAnswer={onAnswer} />}
      <span ref={end} />
    </section>
  );
}
