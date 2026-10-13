/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { PAGE_GAP } from '../../../lib/office/docPages.js';
import { usePageLayout } from './usePageLayout.js';

/**
 * The writing surface. With a page size it is a stack of sheets on a desk,
 * breaking between rows the way the exported PDF does; without one it is
 * the older flowing column. `rows` are [{ id, node, keep }] (keep: stay on the next row's page); `head` is the title
 * row and `after` sits below the last sheet (the "Add a paragraph" button).
 */
export function DocPaper({ size, label, head, rows, after, onBackgroundDown, onPages }) {
  const page = usePageLayout(size);
  const { box, breaks, pages, tail, scale } = page;
  React.useEffect(() => { onPages?.(box ? pages : 0); }, [box, pages, onPages]);

  if (!box) {
    return (
      <div className="hb-of-scroll" onMouseDown={(e) => { if (e.target === e.currentTarget) onBackgroundDown(); }}>
        <article className="hb-of-page" aria-label={label}>
          {head}
          {rows.map((r) => <React.Fragment key={r.id}>{r.node}</React.Fragment>)}
          {after}
        </article>
      </div>
    );
  }

  const band = (blank, n) => (
    <div className="yw-break" data-page-chrome="true" aria-hidden="true" data-label={`Page ${n}`}
      style={{ height: blank + box.margin * 2 + PAGE_GAP, '--yw-gap-top': `${blank + box.margin}px` }} />
  );
  let n = 1;
  const style = { '--yw-page-w': `${box.width}px`, '--yw-page-h': `${box.height}px`, '--yw-margin': `${box.margin}px`, '--yw-gap': `${PAGE_GAP}px` };
  return (
    <div className="hb-of-scroll yw-desk" ref={page.scrollRef} onMouseDown={(e) => { if (e.target === e.currentTarget) onBackgroundDown(); }}>
      <div className="yw-fit" style={{ width: box.width * scale, height: page.height ? page.height * scale : undefined }}>
        <article ref={page.articleRef} className="hb-of-page yw-paper" data-paged="true" aria-label={label}
          style={{ ...style, transform: scale < 1 ? `scale(${scale})` : undefined }}>
          <div data-row-id="__title">{head}</div>
          {rows.map((r) => (
            <React.Fragment key={r.id}>
              {breaks[r.id] !== undefined && band(breaks[r.id], (n += 1))}
              <div data-row-id={r.id} data-keep={r.keep ? 'true' : undefined}>{r.node}</div>
            </React.Fragment>
          ))}
          <div data-page-chrome="true" aria-hidden="true" style={{ height: tail }} />
        </article>
      </div>
      <div className="yw-after">{after}</div>
    </div>
  );
}
