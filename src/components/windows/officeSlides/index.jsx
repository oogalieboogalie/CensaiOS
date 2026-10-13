/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { OfficeBar, OfficeButton, OfficeSep } from '../../office/OfficeBar.jsx';
import { SlideView } from '../../office/slides/SlideView.jsx';
import { PresentMode } from '../../office/slides/PresentMode.jsx';
import { useSlides } from '../../office/slides/useSlides.js';
import { LAYOUTS, THEMES } from '../../../lib/office/slideModel.js';
import { pickFile } from '../../../lib/office/officeFiles.js';
import { readImageFile } from '../../../lib/office/officeImages.js';

const THUMB_W = 132;

function useStageWidth(ref) {
  const [width, setWidth] = React.useState(560);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(() => setWidth(Math.max(240, Math.min(el.clientWidth - 32, ((el.clientHeight - 32) * 16) / 9))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

// Censai Slides: a 16:9 deck on the canvas. Present full screen, export
// PowerPoint and PDF. Each slide syncs on its own.
export function OfficeSlidesWindow({ win = {}, onUpdate }) {
  const d = useSlides(win, onUpdate);
  const stageRef = React.useRef(null);
  const stageW = useStageWidth(stageRef);
  const [presenting, setPresenting] = React.useState(false);
  const [layout, setLayout] = React.useState('titleBody');
  const title = win.title || 'Untitled deck';
  const { deck, slide, block } = d;
  const text = block?.type === 'text' ? block : null;

  const formats = [
    { ext: 'pptx', label: 'PowerPoint', hint: 'Opens in PowerPoint, Keynote, Google Slides', build: async () => (await import('../../../lib/office/slideExport.js')).deckToPptx(deck, { title }) },
    { ext: 'pdf', label: 'PDF', hint: 'One page per slide', build: async () => (await import('../../../lib/office/slideExport.js')).deckToPdf(deck, { title }) },
  ];
  const addPicture = async () => {
    const file = await pickFile('image/png,image/jpeg,image/gif');
    if (!file) return;
    const img = await readImageFile(file);
    const h = Math.min(60, (40 * img.h * 16) / (img.w * 9));
    d.addBlock({ type: 'image', src: img.src, alt: img.alt, iw: img.w, ih: img.h, x: 30, y: 20, w: 40, h });
  };
  const onKeyDown = (e) => {
    if (d.edit.editingId || e.target.closest('input, textarea, select')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && block) { e.preventDefault(); d.removeBlock(); }
  };

  return (
    <>
      <WindowTitle icon={<Icon.Monitor size={12} />} label={title} subtitle="Censai Slides"
        actions={[{ id: 'present', label: 'Present', icon: <Icon.Play size={11} />, onSelect: () => deck.order.length && setPresenting(true) }]} />
      <div className="hb-of" data-app="slides" onKeyDown={onKeyDown}>
        <OfficeBar title={title} formats={formats}>
          <select className="hb-of-select" aria-label="New slide layout" value={layout} onChange={(e) => setLayout(e.target.value)}>
            {Object.entries(LAYOUTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <OfficeButton wide label="Slide" icon={<Icon.Plus size={10} />} title="Add a slide" onClick={() => d.addSlide(layout)} />
          <OfficeSep />
          <OfficeButton wide label="Text" icon={<Icon.Edit size={11} />} title="Add a text box" disabled={!slide} onClick={() => d.addBlock({ type: 'text', role: 'body', text: '', size: 18, align: 'left' })} />
          <OfficeButton wide label="Picture" icon={<Icon.Picture size={12} />} title="Add a picture" disabled={!slide} onClick={addPicture} />
          <OfficeSep />
          <OfficeButton label="Smaller" title="Smaller text" disabled={!text} onClick={() => d.changeBlock(text.id, { size: Math.max(8, (text.size || 18) - 2) })}><span aria-hidden="true">A-</span></OfficeButton>
          <OfficeButton label="Bigger" title="Bigger text" disabled={!text} onClick={() => d.changeBlock(text.id, { size: Math.min(96, (text.size || 18) + 2) })}><span aria-hidden="true">A+</span></OfficeButton>
          <OfficeButton label="B" title="Bold" disabled={!text} pressed={Boolean(text?.bold)} onClick={() => d.changeBlock(text.id, { bold: !text.bold })}><strong>B</strong></OfficeButton>
          {['left', 'center', 'right'].map((a) => (
            <OfficeButton key={a} label={a} title={`Align ${a}`} disabled={!text} pressed={text?.align === a} onClick={() => d.changeBlock(text.id, { align: a })}>
              <span className="hb-of-align" data-align={a} aria-hidden="true"><i /><i /><i /></span>
            </OfficeButton>
          ))}
          <OfficeButton label="Remove" title="Remove the selected box (Delete)" disabled={!block} icon={<Icon.Close size={10} />} onClick={() => d.removeBlock()} />
          <OfficeSep />
          <select className="hb-of-select" aria-label="Theme" value={deck.theme} onChange={(e) => d.setTheme(e.target.value)}>
            {Object.entries(THEMES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
          </select>
        </OfficeBar>
        <div className="hb-of-deck">
          <ol className="hb-of-thumbs" aria-label="Slides">
            {deck.order.map((id, i) => (
              <li key={id} data-current={id === d.current ? 'true' : undefined}>
                <button type="button" className="hb-of-thumb" aria-label={`Slide ${i + 1}`} aria-current={id === d.current ? 'true' : undefined}
                  onClick={() => { d.setCurrentId(id); d.setSelectedId(null); }}>
                  <span className="hb-of-thumb-n">{i + 1}</span>
                  <SlideView slide={deck.slides[id]} theme={deck.theme} width={THUMB_W} />
                </button>
                {id === d.current && (
                  <span className="hb-of-thumb-tools">
                    <button type="button" className="hb-of-mini" aria-label="Move slide up" onClick={() => d.move(id, -1)}><Icon.Up size={9} /></button>
                    <button type="button" className="hb-of-mini" aria-label="Move slide down" onClick={() => d.move(id, 1)}><Icon.Down size={9} /></button>
                    <button type="button" className="hb-of-mini" aria-label="Duplicate slide" onClick={d.duplicate}><Icon.Copy size={9} /></button>
                    <button type="button" className="hb-of-mini" aria-label="Remove slide" onClick={() => d.removeSlide(id)}><Icon.Close size={9} /></button>
                  </span>
                )}
              </li>
            ))}
            <li><button type="button" className="hb-of-add" onClick={() => d.addSlide(layout)}><Icon.Plus size={11} />Slide</button></li>
          </ol>
          <div className="hb-of-stagecol">
            <div className="hb-of-stage" ref={stageRef}>
              {slide ? <SlideView slide={slide} theme={deck.theme} width={stageW} edit={d.edit} label="Slide editor" />
                : <button type="button" className="hb-of-add" onClick={() => d.addSlide('title')}><Icon.Plus size={11} />Add your first slide</button>}
            </div>
            {slide && (
              <textarea className="hb-of-notes" value={slide.notes || ''} placeholder="Speaker notes" aria-label="Speaker notes"
                onChange={(e) => d.setNotes(e.target.value)} />
            )}
          </div>
        </div>
      </div>
      {presenting && <PresentMode deck={deck} startId={d.current} onExit={() => setPresenting(false)} />}
    </>
  );
}

export default OfficeSlidesWindow;
