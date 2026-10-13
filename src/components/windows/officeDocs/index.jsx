/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { OfficeBar, OfficeButton, OfficeSep } from '../../office/OfficeBar.jsx';
import { DocTextBlock } from '../../office/docs/DocTextBlock.jsx';
import { DocImageBlock, DocTableBlock } from '../../office/docs/DocMediaBlocks.jsx';
import { useDocEditor } from '../../office/docs/useDocEditor.js';
import { DocPaper } from '../../office/docs/DocPaper.jsx';
import { PAGE_SIZES, countWords, pageSizeOf } from '../../../lib/office/docPages.js';
import { BLOCK_LABELS, TEXT_TYPES, docPatchFromBlocks, listNumbers, makeBlock, moveBlockPatch } from '../../../lib/office/docModel.js';
import { docToMarkdown, markdownToBlocks } from '../../../lib/office/docMarkdown.js';
import { pickFile } from '../../../lib/office/officeFiles.js';
import { readImageFile } from '../../../lib/office/officeImages.js';

const encode = (text) => new TextEncoder().encode(text);
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOCX = `.docx,${DOCX_MIME}`;

// YorWare Writer (grown from Censai Docs, still window kind officeDocs so
// older boards open unchanged): letters, proposals and long documents on
// Letter or A4 pages, Word import, export to Word, PDF and Markdown. Each
// block syncs on its own, so teammates can write side by side.
export function OfficeDocsWindow({ win = {}, onUpdate }) {
  const editor = useDocEditor(win, onUpdate);
  const { doc, focusedId } = editor;
  const title = win.title || 'Untitled document';
  const size = pageSizeOf(win);
  const page = size?.id || 'letter';
  const [pages, setPages] = React.useState(0);
  const words = countWords(doc, win.title || '');
  const nums = listNumbers(doc.order, doc.blocks);
  const focused = doc.blocks[focusedId];
  const anchor = focused ? focusedId : doc.order[doc.order.length - 1];

  const formats = [
    { ext: 'docx', label: 'Word document', hint: 'Opens in Word, Google Docs, Pages', build: async () => (await import('../../../lib/office/docDocx.js')).docToDocx(doc, { title, page }) },
    { ext: 'pdf', label: 'PDF', hint: `${PAGE_SIZES[page].label} pages, ready to print or send`, build: async () => (await import('../../../lib/office/docPdf.js')).docToPdf(doc, { title, page }) },
    { ext: 'md', label: 'Markdown', hint: 'Plain text with marks', build: async () => encode(docToMarkdown(doc, { title })) },
  ];
  const importFile = async () => {
    const file = await pickFile(`${DOCX},.md,.markdown,.txt,text/markdown,text/plain`);
    if (!file) return;
    const base = file.name.replace(/\.[a-z]+$/i, '');
    let blocks;
    let named = '';
    if (/\.docx$/i.test(file.name) || file.type === DOCX_MIME) {
      ({ title: named, blocks } = await (await import('../../../lib/office/docxImport.js')).docxToDoc(await file.arrayBuffer()));
    } else {
      blocks = markdownToBlocks(await file.text());
      // A leading "# Heading" is the document's title, as Export writes it.
      if (blocks[0]?.type === 'h1') named = blocks.shift().text;
    }
    if (!blocks.length && !named) throw new Error('That file has no text to import.');
    onUpdate?.({ ...docPatchFromBlocks(win, blocks.map((b) => makeBlock(b.type, b))), title: named || base });
  };
  const insertImage = async () => {
    const file = await pickFile('image/png,image/jpeg,image/gif');
    if (file) editor.insertAfter(anchor, [makeBlock('image', await readImageFile(file)), makeBlock('p')]);
  };
  const move = (id, delta) => {
    const patch = moveBlockPatch(doc.order, id, delta);
    if (patch) onUpdate?.(patch);
  };
  const setType = (type) => {
    if (focused && TEXT_TYPES.includes(focused.type)) { editor.patchBlock(focusedId, { type }); editor.focus(focusedId, (focused.text || '').length); }
  };

  const renderBlock = (id) => {
    const block = doc.blocks[id];
    const change = (c) => editor.patchBlock(id, c);
    if (block.type === 'table') return <DocTableBlock block={block} onChange={change} />;
    if (block.type === 'image') return <DocImageBlock block={block} onChange={change} />;
    if (block.type === 'divider') return <div className="hb-of-block" data-type="divider"><hr /></div>;
    return <DocTextBlock id={id} block={block} number={nums[id]} focused={focusedId === id} editor={editor} />;
  };

  return (
    <>
      <WindowTitle icon={<Icon.Files size={12} />} label={title} subtitle="YorWare Writer" />
      <div className="hb-of" data-app="docs">
        <OfficeBar title={title} formats={formats} onImport={importFile} importHint="Open a Word or Markdown file (replaces this document)">
          <select className="hb-of-select" aria-label="Paragraph style" value={focused && TEXT_TYPES.includes(focused.type) ? focused.type : ''}
            onMouseDown={(e) => e.stopPropagation()} onChange={(e) => setType(e.target.value)} disabled={!focused || !TEXT_TYPES.includes(focused.type)}>
            {!focused && <option value="">Style</option>}
            {TEXT_TYPES.map((t) => <option key={t} value={t}>{BLOCK_LABELS[t]}</option>)}
          </select>
          <OfficeButton label="B" title="Bold (Ctrl+B)" onClick={() => editor.wrap('**')}><strong>B</strong></OfficeButton>
          <OfficeButton label="I" title="Italic (Ctrl+I)" onClick={() => editor.wrap('*')}><em>I</em></OfficeButton>
          <OfficeSep />
          <OfficeButton wide label="Table" icon={<Icon.List size={12} />} title="Insert a table" onClick={() => editor.insertAfter(anchor, [makeBlock('table'), makeBlock('p')])} />
          <OfficeButton wide label="Picture" icon={<Icon.Picture size={12} />} title="Insert a picture" onClick={insertImage} />
          <OfficeButton label="Divider" title="Insert a divider" onClick={() => editor.insertAfter(anchor, [makeBlock('divider'), makeBlock('p')])}><span aria-hidden="true">―</span></OfficeButton>
          <OfficeSep />
          <select className="hb-of-select" aria-label="Page size" title="Page size" value={size?.id || 'none'}
            onMouseDown={(e) => e.stopPropagation()} onChange={(e) => onUpdate?.({ docPage: e.target.value === 'none' ? null : e.target.value })}>
            {Object.values(PAGE_SIZES).map((p) => <option key={p.id} value={p.id}>{p.label} pages</option>)}
            <option value="none">No pages</option>
          </select>
        </OfficeBar>
        <DocPaper size={size} label={title} onBackgroundDown={() => editor.setFocusedId(null)} onPages={setPages}
          head={(
            <input className="hb-of-doc-title" value={win.title ?? ''} placeholder="Untitled document" aria-label="Document title"
              onChange={(e) => onUpdate?.({ title: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); doc.order[0] ? editor.focus(doc.order[0], 0) : editor.insertAfter(null, [makeBlock('p')]); } }} />
          )}
          rows={doc.order.map((id) => ({
            id,
            keep: /^h[123]$/.test(doc.blocks[id]?.type),
            node: (
              <div className="hb-of-row" data-focused={focusedId === id ? 'true' : undefined}>
                <div className="hb-of-gutter" data-no-drag>
                  <button type="button" className="hb-of-mini" aria-label="Move up" title="Move up" onClick={() => move(id, -1)}><Icon.Up size={10} /></button>
                  <button type="button" className="hb-of-mini" aria-label="Move down" title="Move down" onClick={() => move(id, 1)}><Icon.Down size={10} /></button>
                  <button type="button" className="hb-of-mini" aria-label="Remove block" title="Remove" onClick={() => editor.remove(id)}><Icon.Close size={9} /></button>
                </div>
                {renderBlock(id)}
              </div>
            ),
          }))}
          after={(
            <button type="button" className="hb-of-add" onClick={() => editor.insertAfter(null, [makeBlock('p')])}>
              <Icon.Plus size={11} />{doc.order.length ? 'Add a paragraph' : 'Start writing'}
            </button>
          )} />
        <div className="yw-status" aria-live="polite">
          <span>{words} {words === 1 ? 'word' : 'words'}</span>
          {size && <span>{pages || 1} {pages === 1 || !pages ? 'page' : 'pages'}</span>}
        </div>
      </div>
    </>
  );
}

export default OfficeDocsWindow;
