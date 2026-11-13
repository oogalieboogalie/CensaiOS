import { useState } from 'react';
import { BrandIcon } from '../brand/BrandIcon.jsx';
import './commandCards.css';

function Who({ card }) {
  if (card.mark) return <BrandIcon brand={card.mark} size={16} tone="mono" title="" />;
  if (card.you) return <span className="hb-cmd-you" data-mark="you" aria-hidden="true" />;
  return null;
}

const STATUS_WORD = { run: 'Running', bad: 'Failed', ok: 'Finished' };

export function CommandCards({ cards = [], onRun, replayed = false }) {
  const [open, setOpen] = useState({});
  const [pending, setPending] = useState(null);
  const empty = replayed
    ? 'Commands from before the reload are not shown.'
    : 'Nothing has been run in this shell yet.';

  return (
    <section className="hb-cmd-list" aria-label="What happened here" onPointerDown={(event) => event.stopPropagation()}>
      <h2>What happened here</h2>
      {cards.length === 0 && <p className="hb-cmd-empty">{empty}</p>}
      {cards.map((card) => {
        const waiting = pending === card.id;
        const shown = Boolean(open[card.id]);
        const showIsFilled = card.running && !waiting;
        const waitText = card.outside
          ? 'This changes things outside this computer. Nothing runs until you say so.'
          : 'Nothing runs until you say so.';
        return (
          <article key={card.id} className="hb-cmd" data-status={card.status} data-outside={card.outside ? 'true' : 'false'}>
            <header>
              <span className="hb-cmd-dot" data-status={card.status} />
              <Who card={card} />
              <span className="hb-cmd-who">{card.who}</span>
              <span className="hb-cmd-title">{card.title}</span>
              <span className="hb-cmd-took">{card.took}</span>
              <span className="hb-sr-only">{STATUS_WORD[card.status] || 'Finished'}</span>
            </header>
            <code>{card.command}</code>
            <p>{card.sentence}</p>
            {shown && <pre>{card.output || 'It printed nothing.'}</pre>}
            <div className="hb-cmd-acts">
              {!card.running && !waiting && (
                <button type="button" className="hb-cmd-go" onClick={() => setPending(card.id)}>
                  Show me first
                </button>
              )}
              {waiting && (
                <button type="button" className="hb-cmd-go" onClick={() => { setPending(null); onRun?.(card.command); }}>
                  Run it
                </button>
              )}
              {waiting && <button type="button" onClick={() => setPending(null)}>Never mind</button>}
              <button
                type="button"
                className={showIsFilled ? 'hb-cmd-go' : undefined}
                onClick={() => setOpen((state) => ({ ...state, [card.id]: !state[card.id] }))}
              >
                {shown ? 'Hide what it printed' : 'Show everything it printed'}
              </button>
            </div>
            {waiting && <p className="hb-cmd-wait">{waitText}</p>}
          </article>
        );
      })}
    </section>
  );
}
