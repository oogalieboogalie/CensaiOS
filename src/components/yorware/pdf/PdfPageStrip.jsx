/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { drawPage } from '../../../lib/yorware/pdfRender.js';
import { shownRotation, shownSize } from '../../../lib/yorware/pdfModel.js';

const THUMB_W = 92;

function Thumb({ page, file }) {
  const ref = React.useRef(null);
  const rotation = shownRotation(page);
  const size = shownSize(page);
  const scale = THUMB_W / size.w;
  React.useEffect(() => {
    if (!ref.current) return undefined;
    return drawPage(ref.current, { fileId: page.file, data: file.data, index: page.index, rotation, scale });
  }, [page.file, page.index, rotation, scale, file.data]);
  return <canvas ref={ref} className="hb-yp-thumb-canvas" style={{ width: THUMB_W, height: size.h * scale }} aria-hidden="true" />;
}

/** The page list on the left: click to open a page, drag to reorder. */
export function PdfPageStrip({ p }) {
  const { doc, pageId } = p;
  const [dragId, setDragId] = React.useState(null);
  const [overIndex, setOverIndex] = React.useState(null);

  const drop = (e, index) => {
    e.preventDefault();
    const id = dragId || e.dataTransfer.getData('text/x-yorware-page');
    setDragId(null);
    setOverIndex(null);
    if (!id || !doc.pages[id]) return;
    const from = doc.order.indexOf(id);
    p.movePage(id, from < index ? index - 1 : index);
  };

  return (
    <ol className="hb-yp-strip" aria-label="Pages">
      {doc.order.map((id, i) => {
        const page = doc.pages[id];
        const file = doc.files[page.file];
        const marks = (doc.marksByPage[id] || []).length;
        return (
          <li key={id} className="hb-yp-thumb" data-current={id === pageId ? 'true' : undefined}
            data-over={overIndex === i ? 'true' : undefined} data-page={id}
            draggable onDragStart={(e) => { setDragId(id); e.dataTransfer.setData('text/x-yorware-page', id); e.dataTransfer.effectAllowed = 'move'; }}
            onDragEnd={() => { setDragId(null); setOverIndex(null); }}
            onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverIndex(i); } }}
            onDrop={(e) => drop(e, i)}>
            <button type="button" className="hb-yp-thumb-btn" aria-current={id === pageId ? 'page' : undefined}
              aria-label={`Page ${i + 1}${marks ? `, ${marks} added` : ''}`} onClick={() => p.goTo(id)}>
              <Thumb page={page} file={file} />
              <span className="hb-yp-thumb-label"><span>{i + 1}</span>{marks > 0 && <span className="hb-yp-thumb-marks">{marks}</span>}</span>
            </button>
          </li>
        );
      })}
      {dragId && (
        <li className="hb-yp-strip-end" data-over={overIndex === doc.order.length ? 'true' : undefined}
          onDragOver={(e) => { e.preventDefault(); setOverIndex(doc.order.length); }} onDrop={(e) => drop(e, doc.order.length)}>Move to end</li>
      )}
    </ol>
  );
}
