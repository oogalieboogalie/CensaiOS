/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { ColorField } from '../../creative/ColorField.jsx';
import { Slider } from '../../creative/Slider.jsx';
import { OfficeButton } from '../../office/OfficeBar.jsx';
import { ToolIcon } from '../../creative/toolIcons.jsx';
import { MASTER, PAGE_SIZES } from '../../../lib/yorware/layoutModel.js';
import { FONTS } from '../../../lib/yorware/layoutFlow.js';
import { LayoutIcon } from '../layoutIcons.jsx';

const NAMES = { text: 'Text frame', image: 'Picture frame', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line' };
const inch = (pt) => Math.round((pt / 72) * 100) / 100;

function Section({ title, aside, children }) {
  return (
    <section className="hb-cr-section">
      <header className="hb-cr-section-head"><span>{title}</span>{aside}</header>
      {children}
    </section>
  );
}

function PageSettings({ p }) {
  const { doc, pageId } = p;
  return (
    <Section title={pageId === MASTER ? 'Master page' : 'Page'}>
      <label className="hb-cr-field"><span>Size</span>
        <select className="hb-of-select" aria-label="Page size" value={doc.size} onChange={(e) => p.setSize(e.target.value)}>
          {Object.entries(PAGE_SIZES).map(([k, s]) => <option key={k} value={k}>{s.label} · {inch(s.w)} × {inch(s.h)} in</option>)}
        </select>
      </label>
      {pageId === MASTER
        ? <p className="hb-cr-hint">What you put here shows on every page: a logo, a footer line. In text, type {'{page}'} for the page number and {'{pages}'} for how many pages there are.</p>
        : (
          <label className="hb-yl-check">
            <input type="checkbox" checked={!doc.pages[pageId]?.noMaster} onChange={p.toggleMaster} />
            <span>Show the master items on this page</span>
          </label>
        )}
      <p className="hb-cr-hint">Draw a frame with the tools on the left. Drop pictures from your computer straight onto the page.</p>
    </Section>
  );
}

function TextSettings({ p, textRef }) {
  const { story: s, one } = p;
  const info = p.flow[p.selected[0]];
  return (
    <Section title="Text" aside={info?.count > 1 ? <span className="hb-cr-num">frame {info.index + 1} of {info.count}</span> : null}>
      <textarea ref={textRef} className="hb-cr-input hb-cr-textarea hb-yl-story" aria-label="Text" value={s.text}
        placeholder="Type here. Text that doesn't fit flows into the next linked frame." onChange={(e) => p.setStory({ text: e.target.value })} />
      <div className="hb-cr-row">
        <select className="hb-of-select" aria-label="Font" value={s.font || 'sans'} onChange={(e) => p.setStory({ font: e.target.value })}>
          {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
        </select>
        <OfficeButton label="Bold" title="Bold" pressed={Boolean(s.bold)} onClick={() => p.setStory({ bold: !s.bold })}><b>B</b></OfficeButton>
        {['left', 'center', 'right'].map((a) => (
          <OfficeButton key={a} label={`Align ${a}`} pressed={(s.align || 'left') === a} icon={<LayoutIcon.Align dir={a} />} onClick={() => p.setStory({ align: a })} />
        ))}
      </div>
      <Slider label="Size" min={6} max={144} unit="pt" value={s.size || 12} onChange={(n) => p.setStory({ size: n })} />
      <Slider label="Line spacing" min={0.9} max={2.5} step={0.05} value={s.lead || 1.25} onChange={(n) => p.setStory({ lead: n })} />
      <div className="hb-cr-field"><span>Color</span><ColorField label="Text color" value={s.color} onChange={(c) => p.setStory({ color: c })} swatches={false} /></div>
      <label className="hb-cr-field"><span>Columns</span>
        <select className="hb-of-select" aria-label="Columns" value={one.cols || 1} onChange={(e) => p.setField('cols', Number(e.target.value))}>
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      {info?.overflow && <p className="hb-yl-warn" role="status">{info.hiddenWords} more word{info.hiddenWords === 1 ? '' : 's'} don't fit. Make the frame bigger, or carry the text on.</p>}
      {p.pageId !== MASTER && (
        <div className="hb-yl-buttons">
          <OfficeButton wide label="Continue on next page" title="Carry this text on to a new frame on the next page" icon={<LayoutIcon.Flow />} onClick={p.continueOnNextPage} />
          <OfficeButton wide label="Link to a frame" title="Then click another text frame: this text flows into it" icon={<LayoutIcon.Link />} pressed={p.tool === 'link'} onClick={p.startLink} />
          {info?.count > 1 && <OfficeButton wide label="Unlink" title="Take this frame out of the story" icon={<LayoutIcon.Unlink />} onClick={p.unlink} />}
        </div>
      )}
    </Section>
  );
}

function BoxSettings({ p, onPickPicture }) {
  const f = p.one;
  const pos = ['x', 'y', 'w', 'h'];
  return (
    <>
      {f.type === 'image' && (
        <Section title="Picture">
          <div className="hb-yl-buttons">
            <OfficeButton wide label={f.img ? 'Replace picture' : 'Choose picture'} icon={<LayoutIcon.Picture />} onClick={() => onPickPicture(p.selected[0])} />
          </div>
          <div className="hb-cr-row" role="group" aria-label="How the picture sits">
            <OfficeButton wide label="Fill frame" pressed={f.fit !== 'fit'} onClick={() => p.setField('fit', 'fill')} />
            <OfficeButton wide label="Show all" pressed={f.fit === 'fit'} onClick={() => p.setField('fit', 'fit')} />
          </div>
        </Section>
      )}
      <Section title={NAMES[f.type]}>
        {f.type !== 'line' && <div className="hb-cr-field"><span>{f.type === 'text' || f.type === 'image' ? 'Back' : 'Fill'}</span><ColorField label="Fill" value={f.fill} allowNone onChange={(c) => p.setField('fill', c)} swatches={false} /></div>}
        <div className="hb-cr-field"><span>{f.type === 'line' ? 'Color' : 'Border'}</span><ColorField label="Border" value={f.stroke} allowNone={f.type !== 'line'} onChange={(c) => p.setField('stroke', c)} swatches={false} /></div>
        <Slider label={f.type === 'line' ? 'Thickness' : 'Border width'} min={0} max={24} step={0.25} unit="pt" value={f.sw || 0} onChange={(n) => p.setField('sw', n)} />
        <Slider label="Opacity" min={0} max={100} unit="%" value={Math.round((f.opacity ?? 1) * 100)} onChange={(n) => p.setField('opacity', n / 100)} />
        <div className="hb-yl-pos" role="group" aria-label="Position and size in inches">
          {pos.map((k) => (
            <label key={k}><span>{k.toUpperCase()}</span>
              <input className="hb-cr-input" type="number" step="0.05" aria-label={`${k.toUpperCase()} in inches`} value={inch(f[k])}
                onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) p.setField(k, v * 72); }} />
            </label>
          ))}
        </div>
      </Section>
    </>
  );
}

/** The right-hand panel: the page's settings, or what you selected. */
export function LayoutPanel({ p, textRef, onPickPicture }) {
  const { one, selected } = p;
  return (
    <aside className="hb-cr-panel hb-yl-panel" aria-label="Layout settings">
      {!selected.length && <PageSettings p={p} />}
      {one?.type === 'text' && p.story && <TextSettings p={p} textRef={textRef} />}
      {one && <BoxSettings p={p} onPickPicture={onPickPicture} />}
      {selected.length > 0 && (
        <Section title={selected.length > 1 ? `${selected.length} selected` : 'Arrange'}>
          <div className="hb-cr-row">
            <OfficeButton label="Bring to front" icon={<ToolIcon.Front />} onClick={() => p.restack(true)} />
            <OfficeButton label="Send to back" icon={<ToolIcon.Back />} onClick={() => p.restack(false)} />
            <OfficeButton label="Duplicate (Ctrl+D)" icon={<LayoutIcon.Duplicate />} onClick={p.duplicate} />
            <OfficeButton label="Delete (Delete)" icon={<LayoutIcon.Trash />} onClick={p.remove} />
          </div>
        </Section>
      )}
    </aside>
  );
}
