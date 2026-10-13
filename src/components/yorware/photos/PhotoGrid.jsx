/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { PhotoIcon } from '../photoIcons.jsx';
import { PhotoCanvas } from './PhotoCanvas.jsx';
import { SORTS, allTags } from '../../../lib/yorware/photoFilter.js';
import { isEdited } from '../../../lib/yorware/photoLibModel.js';

const FLAG_FILTERS = [['all', 'All'], ['pick', 'Picks'], ['reject', 'Rejects'], ['hide-rejects', 'Hide rejects']];

function Badges({ r, photo, edits }) {
  return (
    <span className="hb-yph-badges">
      {r.flag === 'pick' && <span className="hb-yph-badge" data-kind="pick" title="Pick"><PhotoIcon.Pick size={10} /></span>}
      {r.flag === 'reject' && <span className="hb-yph-badge" data-kind="reject" title="Reject"><PhotoIcon.Reject size={10} /></span>}
      {photo.raw && <span className="hb-yph-badge" data-kind="raw" title="Camera raw file">RAW</span>}
      {isEdited(edits) && <span className="hb-yph-badge" data-kind="edited" title="Developed">Edited</span>}
    </span>
  );
}

/** One photo in the grid or the strip. Click selects, double-click opens. */
export function PhotoTile({ p, id, compact = false }) {
  const photo = p.lib.photos[id];
  const r = p.lib.ratings[id];
  const edits = p.lib.edits[id];
  const onClick = (e) => p.toggleSelect(id, { range: e.shiftKey, add: e.ctrlKey || e.metaKey });
  return (
    <li className="hb-yph-tile" data-current={id === p.currentId ? 'true' : undefined} data-selected={p.selected.has(id) ? 'true' : undefined}
      data-reject={r.flag === 'reject' ? 'true' : undefined}>
      <button type="button" className="hb-yph-tile-btn" onClick={compact ? () => p.open(id) : onClick} onDoubleClick={() => p.open(id)}
        aria-label={`${photo.name}${r.stars ? `, ${r.stars} star${r.stars === 1 ? '' : 's'}` : ''}`} aria-pressed={p.selected.has(id)}>
        <span className="hb-yph-thumb"><PhotoCanvas small photo={photo} edits={edits} className="hb-yph-fit" /></span>
        {!compact && (
          <span className="hb-yph-tile-foot">
            <span className="hb-yph-name">{photo.name}</span>
            <span className="hb-yph-stars-text" aria-hidden="true">{r.stars ? '★'.repeat(r.stars) : ''}</span>
          </span>
        )}
        <Badges r={r} photo={photo} edits={edits} />
      </button>
    </li>
  );
}

function FilterBar({ p }) {
  const { filter, setFilter } = p;
  const tags = allTags(p.lib);
  return (
    <div className="hb-yph-filters" role="search" aria-label="Filter photos">
      <input className="hb-cr-input hb-yph-search" type="search" placeholder="Search names, cameras, tags" aria-label="Search photos"
        value={filter.text} onChange={(e) => setFilter({ text: e.target.value })} />
      <select className="hb-of-select" aria-label="Stars at least" value={filter.stars} onChange={(e) => setFilter({ stars: Number(e.target.value) })}>
        {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n ? `${'★'.repeat(n)} and up` : 'Any stars'}</option>)}
      </select>
      <select className="hb-of-select" aria-label="Flags" value={filter.flag} onChange={(e) => setFilter({ flag: e.target.value })}>
        {FLAG_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {tags.length > 0 && (
        <select className="hb-of-select" aria-label="Tag" value={filter.tag} onChange={(e) => setFilter({ tag: e.target.value })}>
          <option value="">Any tag</option>
          {tags.map(([t, n]) => <option key={t} value={t}>{t} ({n})</option>)}
        </select>
      )}
      <select className="hb-of-select" aria-label="Sort by" value={filter.sort} onChange={(e) => setFilter({ sort: e.target.value })}>
        {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <span className="hb-cr-tag hb-cr-num">{p.visible.length} of {p.lib.order.length}</span>
    </div>
  );
}

export function PhotoGrid({ p, onOpenFiles }) {
  if (!p.lib.order.length) {
    return (
      <div className="hb-cr-stage">
        <div className="hb-yph-empty">
          <PhotoIcon.Photo size={28} />
          <div className="hb-yph-empty-title">{p.busy || 'Drop photos here'}</div>
          <p className="hb-cr-hint">JPEG, PNG, WebP and camera raw files (Canon, Nikon, Sony, Fujifilm, DNG and more). Rate and tag them, compare two, and develop: exposure, white balance, tone, colour and crop. Your originals never change, and everyone on this board sees the same library.</p>
          <div className="hb-cr-row">
            <button type="button" className="hb-of-btn" data-wide="true" data-primary="true" disabled={Boolean(p.busy)} onClick={onOpenFiles}><PhotoIcon.Open /><span>Add photos</span></button>
            <button type="button" className="hb-of-btn" data-wide="true" disabled={Boolean(p.busy)} onClick={p.addFromBoard}><PhotoIcon.Board /><span>From this board</span></button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="hb-yph-library">
      <FilterBar p={p} />
      {p.visible.length ? (
        <ul className="hb-yph-grid" aria-label="Photos">
          {p.visible.map((id) => <PhotoTile key={id} p={p} id={id} />)}
        </ul>
      ) : <p className="hb-cr-hint hb-yph-none">No photos match. Change the filters above to see more.</p>}
    </div>
  );
}

/** The row of photos under Develop. */
export function PhotoStrip({ p }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    ref.current?.querySelector('[data-current="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [p.currentId]);
  return (
    <ul className="hb-yph-strip" ref={ref} aria-label="Photos">
      {p.visible.map((id) => <PhotoTile key={id} p={p} id={id} compact />)}
    </ul>
  );
}
