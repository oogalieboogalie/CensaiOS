/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../../Windows.jsx';
import { BrandIcon } from '../../brand/BrandIcon.jsx';
import { hasNativeBrowserPane } from '../../../lib/nativeBrowserPane.js';
import { DEFAULT_SEARXNG, SEARCH_ENGINES, SEARXNG_DIRECTORY, engineFor, normalizeInstance, resultsUrl } from '../../../lib/search/engines.js';
import { useWorkspaceStore } from '../../../lib/store.js';
import { EmptyResults, ExternalResults, FramedResults, NativeResults, TorPanel } from './panels.jsx';

/**
 * Add > Search engines. One window, one engine at a time (switch on the chip
 * row). The desktop app shows every engine's real page in a native view; a
 * web browser frames the engines that allow it and is honest about the rest.
 */
export function SearchEngineWindow({ win = {}, onUpdate }) {
  const engine = engineFor(win.engine);
  const spawnAt = useWorkspaceStore(state => state.spawnAt);
  const [draft, setDraft] = React.useState(win.query || '');
  const [serverDraft, setServerDraft] = React.useState(win.instance || DEFAULT_SEARXNG);
  React.useEffect(() => { setDraft(win.query || ''); }, [win.query]);

  const native = hasNativeBrowserPane();
  const query = win.query || '';
  const url = resultsUrl(engine.id, query, { instance: win.instance });

  const pickEngine = (next) => {
    if (next.kind === 'research') { spawnAt?.('research', {}); return; }
    onUpdate?.({ engine: next.id, title: next.label });
  };
  const submit = (e) => {
    e.preventDefault();
    const q = draft.trim();
    if (q) onUpdate?.({ query: q });
  };
  const saveServer = (e) => {
    e.preventDefault();
    const clean = normalizeInstance(serverDraft);
    setServerDraft(clean);
    onUpdate?.({ instance: clean });
  };

  let body;
  if (engine.kind === 'network') body = <TorPanel />;
  else if (!url) body = <EmptyResults engine={engine} native={native} />;
  else if (native) body = <NativeResults winId={win.id} url={url} />;
  else if (engine.embed) body = <FramedResults engine={engine} url={url} />;
  else body = <ExternalResults engine={engine} url={url} onSwitch={() => pickEngine(engineFor('duckduckgo'))} />;

  return (
    <div className="se" data-engine={engine.id}>
      <WindowTitle label={engine.label} subtitle={engine.kind === 'web' && query ? query : undefined} />
      <div className="se-engines" role="tablist" aria-label="Search engine">
        {SEARCH_ENGINES.map(e => (
          <button key={e.id} type="button" role="tab" className="se-engine" aria-selected={e.id === engine.id}
            title={e.hint} onPointerDown={ev => ev.stopPropagation()} onClick={() => pickEngine(e)}>
            <BrandIcon brand={e.id === 'tor' ? 'torproject' : e.id} size={14} title="" />
            <span>{e.label}</span>
          </button>
        ))}
      </div>
      {engine.kind === 'web' && (
        <form className="se-bar" onSubmit={submit}>
          <span className="se-bar-mark"><BrandIcon brand={engine.id} size={16} tone="color" title="" /></span>
          <input className="se-input" value={draft} onChange={e => setDraft(e.target.value)}
            onPointerDown={e => e.stopPropagation()} placeholder={`Search ${engine.label}`} aria-label={`Search ${engine.label}`} />
          <button type="submit" className="se-btn se-btn--primary" disabled={!draft.trim()}>Search</button>
        </form>
      )}
      {engine.id === 'searxng' && (
        <form className="se-server" onSubmit={saveServer}>
          <label htmlFor={`se-server-${win.id}`}>Server</label>
          <input id={`se-server-${win.id}`} className="se-input se-input--small" value={serverDraft}
            onChange={e => setServerDraft(e.target.value)} onPointerDown={e => e.stopPropagation()} />
          <button type="submit" className="se-btn">Use</button>
          <a className="se-link" href={SEARXNG_DIRECTORY} target="_blank" rel="noopener noreferrer">Find a server</a>
        </form>
      )}
      <div className="se-body">{body}</div>
    </div>
  );
}

export default SearchEngineWindow;
