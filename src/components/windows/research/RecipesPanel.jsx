/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { copyToClipboard } from '../../../lib/chat/clipboard.js';
import { apaCitation, mlaCitation } from '../../../lib/research/citations.js';
import { hostOf, shortDate } from '../../../lib/research/researchApi.js';

export const RECIPES = [
  { id: 'references', label: 'References', hint: 'Citable sources for a paper, with APA and MLA', placeholder: 'Topic, e.g. effects of sleep on memory in teenagers', run: 'Find sources' },
  { id: 'market', label: 'Market brief', hint: 'Today’s news on a ticker or sector, summarized', placeholder: 'Ticker or sector, e.g. NVDA or regional banks', run: 'Get brief' },
  { id: 'compare', label: 'Compare and price', hint: 'A chart of options with best prices and sources', placeholder: 'e.g. oat milk and almond milk vs soy milk', run: 'Build chart' },
  { id: 'sales', label: 'Sales leads', hint: 'Prospects and a 7-day outreach campaign in LeadHound', run: 'Open LeadHound' },
];

function CopyButton({ text, label }) {
  const [done, setDone] = React.useState(false);
  return (
    <button type="button" className="hb-lh-pill" data-size="sm"
      onClick={async () => { if (await copyToClipboard(text)) { setDone(true); setTimeout(() => setDone(false), 1200); } }}>
      <Icon.Copy size={10} />{done ? 'Copied' : label}
    </button>
  );
}

function References({ out }) {
  const all = (style) => out.refs.map((ref) => (style === 'apa' ? apaCitation(ref) : mlaCitation(ref))).join('\n\n');
  return (
    <section className="hb-rs-recipe-out" aria-label="References">
      <div className="hb-rs-head">
        <span className="hb-rs-head-q">{out.refs.length} sources for “{out.input}”</span>
        {out.saved > 0 && <span className="hb-lh-mono">saved to the knowledge base</span>}
        {out.refs.length > 0 && <span className="hb-rs-head-actions"><CopyButton text={all('apa')} label="Copy all APA" /><CopyButton text={all('mla')} label="Copy all MLA" /></span>}
      </div>
      {out.refs.map((ref) => (
        <article key={ref.url} className="hb-rs-card hb-rs-ref">
          <div className="hb-rs-card-main">
            <a className="hb-rs-card-title" href={ref.url} target="_blank" rel="noreferrer">{ref.title}</a>
            <div className="hb-rs-meta">
              <span>{ref.author || 'No author listed'}</span><span>{ref.year || 'n.d.'}</span><span>{ref.site}</span>
            </div>
            {ref.summary && <p className="hb-rs-snippet">{ref.summary}</p>}
            <div className="hb-rs-cite"><span className="hb-lh-label">APA</span><span>{apaCitation(ref)}</span></div>
            <div className="hb-rs-cite"><span className="hb-lh-label">MLA</span><span>{mlaCitation(ref)}</span></div>
          </div>
          <CopyButton text={apaCitation(ref)} label="APA" />
        </article>
      ))}
    </section>
  );
}

// News carries a time when the source gives one; plain dates stay dates.
function newsTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || !String(value).includes('T')) return shortDate(value);
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function Market({ out, onRefresh, busy, readOnly }) {
  return (
    <section className="hb-rs-recipe-out" aria-label="Market brief">
      <div className="hb-rs-head">
        <span className="hb-rs-head-q">{out.input}</span>
        <span className="hb-lh-mono">as of {new Date(out.refreshedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
        {!readOnly && <span className="hb-rs-head-actions"><button type="button" className="hb-lh-pill" data-size="sm" disabled={busy} onClick={onRefresh}><Icon.Refresh size={10} />{busy ? 'Refreshing…' : 'Refresh'}</button></span>}
      </div>
      {out.watch && <div className="hb-rs-answer"><div className="hb-lh-label">What to watch</div><p>{out.watch}</p></div>}
      <ul className="hb-rs-news">
        {out.items.map((item) => (
          <li key={item.url}>
            <p>{item.summary}</p>
            <div className="hb-rs-meta">
              <a href={item.url} target="_blank" rel="noreferrer">{item.source || hostOf(item.url)}</a>
              {item.publishedAt && <span>{newsTime(item.publishedAt)}</span>}
            </div>
          </li>
        ))}
      </ul>
      {out.items.length === 0 && <div className="hb-rs-empty"><p>No news came back for that. Try the company name or a sector.</p></div>}
    </section>
  );
}

export function RecipesPanel({ research, onCompare, onSales }) {
  const { recipe: saved, busy, readOnly } = research;
  const [pick, setPick] = React.useState(saved?.recipe || 'references');
  const [input, setInput] = React.useState('');
  const [criteria, setCriteria] = React.useState('');
  const [place, setPlace] = React.useState('');
  const active = RECIPES.find((r) => r.id === pick);

  const submit = async (event) => {
    event.preventDefault();
    if (pick === 'sales') { onSales(); return; }
    if (!input.trim() || busy) return;
    if (pick === 'compare') { onCompare({ items: input, criteria, place }); return; }
    research.runRecipe(pick, input.trim());
  };

  return (
    <div className="hb-rs-panel">
      {!readOnly && (
        <>
          <div className="hb-rs-recipes" role="radiogroup" aria-label="Recipe">
            {RECIPES.map((r) => (
              <button key={r.id} type="button" role="radio" aria-checked={pick === r.id} onClick={() => setPick(r.id)}>
                <span className="hb-rs-recipe-name">{r.label}</span>
                <span className="hb-rs-recipe-hint">{r.hint}</span>
              </button>
            ))}
          </div>
          <form className="hb-rs-search" onSubmit={submit}>
            {pick !== 'sales' && (
              <div className="hb-rs-searchbox">
                <Icon.Search size={14} />
                <input className="hb-rs-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder={active.placeholder} aria-label={`${active.label} input`} />
                <button type="submit" className="hb-lh-pill" data-primary="true" disabled={busy === 'recipe' || !input.trim()}>{busy === 'recipe' ? 'Working…' : active.run}</button>
              </div>
            )}
            {pick === 'compare' && (
              <div className="hb-rs-options">
                <input className="hb-sheet-field" value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder="Compare on (optional): protein, sugar, taste" aria-label="Compare on" />
                <input className="hb-sheet-field" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Near (optional): Austin, TX" aria-label="Near" />
              </div>
            )}
            {pick === 'sales' && (
              <div className="hb-rs-note">
                LeadHound asks what you sell and who you sell to, finds prospects on the live web with Tavily, and drafts a customized 7-day outreach campaign and an ice breaker for the strongest ones.
                <div><button type="submit" className="hb-lh-pill" data-primary="true">Open LeadHound</button></div>
              </div>
            )}
          </form>
        </>
      )}
      {saved?.recipe === 'references' && <References out={saved} />}
      {saved?.recipe === 'market' && <Market out={saved} busy={busy === 'recipe'} readOnly={readOnly} onRefresh={() => research.runRecipe('market', saved.input)} />}
      {!saved && readOnly && <div className="hb-rs-empty"><p>No recipe run on this board yet.</p></div>}
    </div>
  );
}
