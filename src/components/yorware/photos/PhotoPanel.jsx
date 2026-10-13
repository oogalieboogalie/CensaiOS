/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { PhotoIcon } from '../photoIcons.jsx';
import { SLIDERS, cleanTag } from '../../../lib/yorware/photoLibModel.js';
import { shotLine } from '../../../lib/yorware/photoFilter.js';
import { DevelopSection } from './PhotoDevelopPanel.jsx';

function Info({ photo }) {
  const m = photo.meta || {};
  const taken = m.taken ? new Date(m.taken) : null;
  return (
    <section className="hb-cr-section" aria-label="About this photo">
      <header className="hb-cr-section-head"><span>Photo</span>{photo.raw && <span className="hb-yph-badge" data-kind="raw">RAW</span>}</header>
      <div className="hb-yph-info-name">{photo.name}</div>
      {m.camera && <div className="hb-yph-info">{m.camera}{m.lens ? ` · ${m.lens}` : ''}</div>}
      {shotLine(m) && <div className="hb-yph-info hb-cr-num">{shotLine(m)}</div>}
      {taken && <div className="hb-yph-info">{taken.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</div>}
      <div className="hb-yph-info hb-cr-num">{photo.w} × {photo.h} working copy</div>
      {photo.raw && <p className="hb-cr-hint">Developed from the full-size picture your camera stored inside the raw file.</p>}
    </section>
  );
}

function Rating({ p }) {
  const n = p.targets.length;
  const r = p.lib.ratings[p.targets[0]] || { stars: 0, flag: null };
  const same = (k) => p.targets.every((id) => p.lib.ratings[id]?.[k] === r[k]);
  const stars = same('stars') ? r.stars : 0;
  return (
    <section className="hb-cr-section" aria-label="Rating">
      <header className="hb-cr-section-head"><span>Rating</span>{n > 1 && <span className="hb-cr-tag">{n} selected</span>}</header>
      <div className="hb-cr-row" role="group" aria-label="Stars">
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} type="button" className="hb-of-btn hb-yph-star" data-on={s <= stars ? 'true' : undefined}
            aria-label={`${s} star${s === 1 ? '' : 's'}`} title={`${s} star${s === 1 ? '' : 's'} (${s})`}
            onClick={() => p.setStars(stars === s && n === 1 ? 0 : s)}>
            {s <= stars ? <PhotoIcon.StarFill /> : <PhotoIcon.Star />}
          </button>
        ))}
      </div>
      <div className="hb-cr-row">
        <button type="button" className="hb-of-btn" data-wide="true" aria-pressed={same('flag') && r.flag === 'pick'} title="Pick (P)" onClick={() => p.setFlag('pick')}><PhotoIcon.Pick /><span>Pick</span></button>
        <button type="button" className="hb-of-btn" data-wide="true" aria-pressed={same('flag') && r.flag === 'reject'} title="Reject (X)" onClick={() => p.setFlag('reject')}><PhotoIcon.Reject /><span>Reject</span></button>
      </div>
    </section>
  );
}

function Tags({ p }) {
  const [draft, setDraft] = React.useState('');
  const tags = [...new Set(p.targets.flatMap((id) => p.lib.ratings[id]?.tags || []))];
  const add = () => {
    const t = cleanTag(draft);
    if (t) p.addTag(t);
    setDraft('');
  };
  return (
    <section className="hb-cr-section" aria-label="Tags">
      <header className="hb-cr-section-head"><span>Tags</span></header>
      {tags.length > 0 && (
        <div className="hb-yph-tags">
          {tags.map((t) => (
            <span key={t} className="hb-yph-tagchip">{t}
              <button type="button" className="hb-of-mini" aria-label={`Remove tag ${t}`} onClick={() => p.removeTag(t)}><Icon.Close size={8} /></button>
            </span>
          ))}
        </div>
      )}
      <input className="hb-cr-input" placeholder="Add a tag and press Enter" aria-label="Add a tag" value={draft}
        onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add} />
    </section>
  );
}

/** The panel on the right: about the photo, rating, tags, and (in Develop) the sliders. */
export function PhotoPanel({ p, develop, ratio, setRatio, drawn }) {
  if (!p.photo) return null;
  return (
    <aside className="hb-cr-panel hb-yph-panel" aria-label="Photo details">
      <Info photo={p.photo} />
      <Rating p={p} />
      <Tags p={p} />
      {develop && <DevelopSection p={p} ratio={ratio} setRatio={setRatio} drawn={drawn} sliders={SLIDERS} />}
    </aside>
  );
}
