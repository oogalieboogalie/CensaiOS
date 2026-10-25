/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { BrandIcon } from '../../brand/BrandIcon.jsx';
import { useNativeBrowserPane } from '../../../lib/nativeBrowserPane.js';
import { hiddenMessage } from '../../../lib/paneCover.js';
import { DDG_ONION, TOR_DOWNLOAD } from '../../../lib/search/engines.js';
import { webOnlyFrameSrc } from '../../../lib/frameSrc.js';

/** Before the first search: the engine's mark and where results will show. */
export function EmptyResults({ engine, native }) {
  const where = native || engine.embed
    ? 'Results show right here in the window.'
    : `On the web, ${engine.label} results open in your browser. The desktop app shows them here.`;
  return (
    <div className="se-empty">
      <BrandIcon brand={engine.id} size={40} tone="color" title="" />
      <div className="se-empty-title">Search {engine.label}</div>
      <div className="se-faint">{where}</div>
    </div>
  );
}

/** Desktop app: the engine's real page in a native view over this area. */
export function NativeResults({ winId, url }) {
  const areaRef = React.useRef(null);
  const pane = useNativeBrowserPane({ winId: `search-${winId}`, areaRef, url });
  const { navigate } = pane;
  React.useEffect(() => { navigate(url); }, [url]);
  return (
    <div ref={areaRef} className="se-native">
      <span className="se-faint">{pane.visible ? 'Loading results' : hiddenMessage(pane.hiddenBy)}</span>
    </div>
  );
}

/** Web build, engines that allow framing. The browser link is always there. */
export function FramedResults({ engine, url: rawUrl }) {
  const url = webOnlyFrameSrc(rawUrl);
  return (
    <div className="se-framed">
      <iframe key={url} src={url} title={`${engine.label} results`} className="se-frame"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer" />
      <div className="se-foot">
        <span className="se-faint">Page blank? Some servers block being shown inside other apps.</span>
        <a className="se-link" href={url} target="_blank" rel="noopener noreferrer">Open in your browser</a>
      </div>
    </div>
  );
}

/** Web build, engines that refuse framing (Google, Bing...): say so plainly. */
export function ExternalResults({ engine, url, onSwitch }) {
  return (
    <div className="se-empty">
      <BrandIcon brand={engine.id} size={40} tone="color" title="" />
      <div className="se-empty-title">{engine.label} opens in your browser</div>
      <div className="se-faint se-measure">
        {engine.label} doesn&apos;t allow its results inside other apps, so this window can&apos;t show them in a web browser.
        The censaiOS desktop app shows them right here.
      </div>
      <div className="se-row">
        <a className="se-btn se-btn--primary" href={url} target="_blank" rel="noopener noreferrer">Open results in your browser</a>
        <button type="button" className="se-btn" onClick={onSwitch}>Search DuckDuckGo here instead</button>
      </div>
    </div>
  );
}

/** Tor is a network, not an engine: point at the Tor Browser and the onion address. */
export function TorPanel() {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(DDG_ONION); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  };
  return (
    <div className="se-empty">
      <BrandIcon brand="torproject" size={40} tone="color" title="" />
      <div className="se-empty-title">Tor needs the Tor Browser</div>
      <div className="se-faint se-measure">Tor is a private network, not a search engine, and onion sites only open in the Tor Browser. Paste this DuckDuckGo onion address there to search privately.</div>
      <div className="se-onion">
        <code className="se-code" data-testid="se-onion">{DDG_ONION}</code>
        <button type="button" className="se-btn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <a className="se-link" href={TOR_DOWNLOAD} target="_blank" rel="noopener noreferrer">Get the Tor Browser</a>
    </div>
  );
}
