/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { hostOf, shortDate } from '../../../lib/research/researchApi.js';

function SearchBar({ initial, busy, disabled, onSearch }) {
  const [query, setQuery] = React.useState(initial?.query || '');
  const [depth, setDepth] = React.useState(initial?.depth || 'basic');
  const [includeAnswer, setIncludeAnswer] = React.useState(initial?.includeAnswer !== false);
  const submit = (event) => {
    event.preventDefault();
    if (query.trim() && !busy) onSearch({ query: query.trim(), depth, includeAnswer });
  };
  return (
    <form className="hb-rs-search" onSubmit={submit} role="search">
      <div className="hb-rs-searchbox">
        <Icon.Search size={14} />
        <input className="hb-rs-input" value={query} onChange={(e) => setQuery(e.target.value)} disabled={disabled}
          placeholder="Search the web with Tavily" aria-label="Search the web" />
        <button type="submit" className="hb-lh-pill" data-primary="true" disabled={disabled || busy || !query.trim()}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </div>
      <div className="hb-rs-options">
        <div className="hb-rs-seg" role="group" aria-label="Search depth">
          {['basic', 'advanced'].map((d) => (
            <button key={d} type="button" aria-pressed={depth === d} disabled={disabled} onClick={() => setDepth(d)}>
              {d === 'basic' ? 'Basic' : 'Advanced'}
            </button>
          ))}
        </div>
        <label className="hb-rs-check">
          <input type="checkbox" checked={includeAnswer} disabled={disabled} onChange={(e) => setIncludeAnswer(e.target.checked)} />
          Include answer
        </label>
      </div>
    </form>
  );
}

function ResultCard({ result, saved, picked, onPick, onSave, readOnly, busy }) {
  return (
    <article className="hb-rs-card" data-saved={saved ? 'true' : undefined}>
      {!readOnly && (
        <input type="checkbox" className="hb-rs-pick" checked={picked} disabled={saved} onChange={onPick}
          aria-label={`Select ${result.title}`} />
      )}
      <div className="hb-rs-card-main">
        <a className="hb-rs-card-title" href={result.url} target="_blank" rel="noreferrer">{result.title}</a>
        <div className="hb-rs-meta">
          <span>{hostOf(result.url)}</span>
          {result.publishedAt && <span>{shortDate(result.publishedAt)}</span>}
          {Number.isFinite(result.score) && <span className="hb-lh-mono">{Math.round(result.score * 100)}%</span>}
        </div>
        {result.content && <p className="hb-rs-snippet">{result.content}</p>}
      </div>
      {!readOnly && (
        saved
          ? <span className="hb-rs-saved"><Icon.Check size={11} />Saved</span>
          : <button type="button" className="hb-lh-pill" data-size="sm" disabled={busy} onClick={onSave}>Save to board</button>
      )}
    </article>
  );
}

export function SearchPanel({ research, onAskTab }) {
  const { lastSearch, kb, busy, readOnly, status } = research;
  const [picked, setPicked] = React.useState(() => new Set());
  const savedUrls = React.useMemo(() => new Set(kb.map((s) => s.url)), [kb]);
  const results = lastSearch?.results || [];
  const unsaved = results.filter((r) => !savedUrls.has(r.url));
  React.useEffect(() => { setPicked(new Set()); }, [lastSearch?.searchedAt]);

  const toggle = (url) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(url)) next.delete(url); else next.add(url);
    return next;
  });
  const saveList = async (list) => {
    const out = await research.save(list);
    if (out) setPicked(new Set());
  };
  const canSearch = !readOnly && status.tavily;

  return (
    <div className="hb-rs-panel">
      {!readOnly && <SearchBar key={lastSearch?.searchedAt || 'new'} initial={lastSearch} busy={busy === 'search'} disabled={!canSearch} onSearch={research.search} />}
      {!lastSearch && (
        <div className="hb-rs-empty">
          <p>Search the web, save what matters to this board, then ask questions over it from here or from any chat.</p>
          {readOnly && <p className="hb-lh-mono">Nothing searched on this board yet.</p>}
        </div>
      )}
      {lastSearch && (
        <>
          <div className="hb-rs-head">
            <span className="hb-rs-head-q">{lastSearch.query}</span>
            <span className="hb-lh-mono">{results.length} results · {lastSearch.depth}{lastSearch.by ? ` · ${lastSearch.by}` : ''}</span>
            {!readOnly && results.length > 0 && (
              <span className="hb-rs-head-actions">
                {picked.size > 0 && (
                  <button type="button" className="hb-lh-pill" data-size="sm" disabled={Boolean(busy)}
                    onClick={() => saveList(results.filter((r) => picked.has(r.url)))}>Save {picked.size} selected</button>
                )}
                <button type="button" className="hb-lh-pill" data-size="sm" data-primary="true" disabled={Boolean(busy) || !unsaved.length}
                  onClick={() => saveList(unsaved)}>{busy === 'save' ? 'Saving…' : unsaved.length ? 'Save whole search' : 'All saved'}</button>
              </span>
            )}
          </div>
          {lastSearch.answer && (
            <section className="hb-rs-answer" aria-label="Tavily answer">
              <div className="hb-lh-label">Answer</div>
              <p>{lastSearch.answer}</p>
              <button type="button" className="hb-text-btn" onClick={onAskTab}>Ask a follow-up over saved sources</button>
            </section>
          )}
          <div className="hb-rs-results">
            {results.map((r) => (
              <ResultCard key={r.url} result={r} saved={savedUrls.has(r.url)} picked={picked.has(r.url)} readOnly={readOnly}
                busy={Boolean(busy)} onPick={() => toggle(r.url)} onSave={() => saveList([r])} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
