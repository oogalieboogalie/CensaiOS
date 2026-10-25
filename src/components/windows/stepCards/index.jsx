import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { cardFinished, stepsLeft } from '../../../lib/stepCards/stack.js';
import { useStepCards } from './useStepCards.js';
import { StepStack } from './StepStack.jsx';
import { AssignChip } from './AssignChip.jsx';

function CardList({ sc, onAdd, adding }) {
  return (
    <nav className="hb-sc-list" aria-label="Cards">
      <button type="button" className="hb-sc-btn" data-primary={adding || undefined} onClick={onAdd}>Add a card</button>
      {sc.cards.map((card) => {
        const done = card.steps.length - stepsLeft(card).length;
        return (
          <div key={card.id} className="hb-sc-card" aria-current={!adding && card.id === sc.selected?.id ? 'true' : undefined}>
            <button type="button" className="hb-sc-card-main" onClick={() => sc.select(card.id)}>
              <span className="hb-sc-card-title">{card.title}</span>
              <span className="hb-sc-faint">{cardFinished(card) ? 'All steps finished' : `${done} of ${card.steps.length} steps finished`}</span>
            </button>
            <AssignChip card={card} onAssign={(value, name) => sc.assign(card.id, value, name)} />
          </div>
        );
      })}
    </nav>
  );
}

function AddCard({ sc, onDone }) {
  const [text, setText] = React.useState('');
  const fileRef = React.useRef(null);
  const translate = async () => { if (await sc.translate(text)) { setText(''); onDone(); } };
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file && await sc.importText(await file.text())) onDone();
  };
  return (
    <div className="hb-sc-add">
      <h3 className="hb-sc-step-title">Turn a card into steps</h3>
      <p className="hb-sc-step-text">Paste a work card (like a Grok Build card). Censai splits it into small steps in plain words, each with dots that turn green only when censaiOS has checked them. It uses your own saved AI key.</p>
      <textarea className="hb-sc-input" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the card here: its goal, the files it touches and how to tell it worked." />
      <div className="hb-sc-actions">
        <button type="button" className="hb-sc-btn" data-primary="true" disabled={!text.trim() || Boolean(sc.busy)} onClick={translate}>
          {sc.busy === 'translating' ? 'Censai is splitting it…' : 'Make the steps'}
        </button>
        <button type="button" className="hb-sc-btn" disabled={Boolean(sc.busy)} onClick={() => fileRef.current?.click()}>Open a .todo file</button>
        <input ref={fileRef} type="file" accept=".todo,text/plain" hidden onChange={pick} />
      </div>
    </div>
  );
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Step cards: a work card split into plain-words steps, shown as a stack of
// tabs. Only the top tab is open; its dots turn green as censaiOS checks each
// check, and when they are all green the tab goes away and the next unlocks.
export function StepCardsWindow({ win = {}, onUpdate, currentProject }) {
  const sc = useStepCards({ win, onUpdate, currentProject });
  const [addingState, setAdding] = React.useState(false);
  const adding = addingState || sc.cards.length === 0;
  const card = sc.selected;
  const actions = [
    sc.cards.length > 0 && { id: 'save', label: 'Save as .todo', title: 'Download these cards as a .todo file', onSelect: () => download(`${(win.title || 'step-cards').replace(/[^\w-]+/g, '-')}.todo`, sc.exportText()) },
    card && !adding && { id: 'remove', label: 'Remove this card', onSelect: () => sc.remove(card.id) },
  ].filter(Boolean);

  return (
    <>
      <WindowTitle icon={<Icon.List size={12} />} label={win.title || 'Step cards'} subtitle={sc.folder ? sc.folder.split(/[\\/]/).pop() : 'no project open'} actions={actions} />
      <div className="hb-sc">
        {sc.cards.length > 0 && <CardList sc={sc} adding={adding} onAdd={() => setAdding(true)} />}
        <main className="hb-sc-main">
          {sc.error && <div className="hb-sc-alert" role="alert">{sc.error}</div>}
          {sc.note && !sc.error && <div className="hb-sc-note" role="status">{sc.note}</div>}
          {adding ? <AddCard sc={sc} onDone={() => setAdding(false)} />
            : card && (
              <>
                <header className="hb-sc-head">
                  <div>
                    <h2 className="hb-sc-h2">{card.title}</h2>
                    {card.goal && <div className="hb-sc-faint">{card.goal}</div>}
                  </div>
                  <AssignChip card={card} showName onAssign={(value, name) => sc.assign(card.id, value, name)} />
                </header>
                <StepStack card={card} sc={sc} />
              </>
            )}
        </main>
      </div>
    </>
  );
}

export default StepCardsWindow;
