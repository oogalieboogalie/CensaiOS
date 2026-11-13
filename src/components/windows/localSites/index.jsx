/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { SITE_PRESETS } from '../../../lib/localSites/presets.js';
import { useFramePage } from '../../../lib/useFramePage.js';
import { useLocalSite } from './useLocalSite.js';
import { SiteForm } from './SiteForm.jsx';
import { windowMeta } from './meta.js';

export { windowMeta };

const WIDE = 1280;

// The computer view lays the page out at a real desktop width, then shrinks
// it to fit, so the site's own wide-screen layout is what shows.
function Preview({ html, width }) {
  const stageRef = React.useRef(null);
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  React.useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // A teammate's form often changes just after their frame opens: one page at a time.
  const [page, onLoad] = useFramePage(html);
  const zoom = width === 'wide' && box.w ? Math.min(1, box.w / WIDE) : 1;
  const style = width === 'wide' && box.w ? { width: WIDE, height: box.h / zoom, zoom } : undefined;
  return (
    <div className="hb-ls-stage" ref={stageRef}>
      <iframe title="Website preview" className={`hb-ls-frame hb-ls-frame-${width}`} srcDoc={page} onLoad={onLoad} style={style}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" />
    </div>
  );
}

/**
 * Local Sites: pick the kind of shop, fill in the details, watch the page
 * change beside the form, then download the whole site as a folder.
 */
export function LocalSitesWindow({ win = {}, onUpdate }) {
  const ls = useLocalSite({ win, onUpdate });
  const [width, setWidth] = React.useState('phone');
  const openRef = React.useRef(null);

  return (
    <>
      <WindowTitle icon={<Icon.ShoppingBag size={12} />} label={win.title || windowMeta.label} subtitle={ls.preset.label} />
      <div className="hb-ls">
        <div className="hb-ls-bar">
          <div className="hb-ls-kinds" role="radiogroup" aria-label="Kind of shop">
            {SITE_PRESETS.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={ls.preset.id === p.id}
                className={`hb-ls-kind${ls.preset.id === p.id ? ' is-on' : ''}`} title={p.hint} onClick={() => ls.pickPreset(p.id)}>
                <span className="hb-ls-swatch" style={{ background: p.palette.accent, borderColor: p.palette.bg }} />{p.label}
              </button>
            ))}
          </div>
          <div className="hb-ls-spacer" />
          <div className="hb-ls-kinds" role="radiogroup" aria-label="Preview size">
            {[['phone', 'Phone'], ['wide', 'Computer']].map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={width === id}
                className={`hb-ls-kind${width === id ? ' is-on' : ''}`} onClick={() => setWidth(id)}>{label}</button>
            ))}
          </div>
          <button type="button" className="hb-ls-btn" onClick={() => openRef.current?.click()}>Open a saved site</button>
          <input ref={openRef} type="file" accept=".json,application/json" hidden
            onChange={(e) => { ls.openSaved(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" className="hb-ls-btn hb-ls-btn-primary" onClick={ls.downloadSite}>
            <Icon.Download size={12} />Download site
          </button>
        </div>
        {ls.error && <div role="alert" className="hb-ls-alert">{ls.error}</div>}
        {ls.note && !ls.error && <div role="status" className="hb-ls-note">{ls.note}</div>}
        <div className="hb-ls-body">
          <SiteForm ls={ls} />
          <Preview html={ls.preview} width={width} />
        </div>
      </div>
    </>
  );
}

export default LocalSitesWindow;
