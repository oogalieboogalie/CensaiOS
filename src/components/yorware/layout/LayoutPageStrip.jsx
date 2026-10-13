/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { MASTER } from '../../../lib/yorware/layoutModel.js';
import { pageItems } from '../../../lib/yorware/layoutPlan.js';
import { LayoutThumb } from './LayoutItem.jsx';

const THUMB_W = 92;

/** Pages down the left: the Master page on top, then every page, then Add page. */
export function LayoutPageStrip({ p }) {
  const { doc, flow, pageId } = p;
  const scale = THUMB_W / doc.w;
  const tile = (id, label, extra) => (
    <li key={id} className="hb-yl-thumb" data-current={pageId === id ? 'true' : undefined}>
      <button type="button" className="hb-yl-thumb-btn" aria-current={pageId === id ? 'page' : undefined} aria-label={label} onClick={() => p.goTo(id)}>
        <LayoutThumb doc={doc} items={pageItems(doc, id, flow)} scale={scale} label={label} />
        <span className="hb-yl-thumb-label">{extra}</span>
      </button>
    </li>
  );
  return (
    <ul className="hb-yl-strip" aria-label="Pages">
      {tile(MASTER, 'Master page: items on every page', 'Master')}
      {doc.order.map((id, i) => tile(id, `Page ${i + 1}`, doc.pages[id]?.noMaster ? `${i + 1} · no master` : String(i + 1)))}
      <li>
        <button type="button" className="hb-of-btn hb-yl-addpage" data-wide="true" onClick={p.addPage}>
          <Icon.Plus size={10} /><span>Add page</span>
        </button>
      </li>
    </ul>
  );
}
