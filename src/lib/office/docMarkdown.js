// Censai Docs <-> Markdown. Export writes plain GitHub-flavoured markdown;
// import reads the same subset back (headings, lists, quotes, code fences,
// tables, images, rules). Pure, no React.
import { listNumbers } from './docModel.js';

const PREFIX = { h1: '# ', h2: '## ', h3: '### ', bullet: '- ', quote: '> ' };

function cell(text) {
  return String(text || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function docToMarkdown({ order, blocks }, { title } = {}) {
  const nums = listNumbers(order, blocks);
  const out = [];
  if (title) out.push(`# ${title}`, '');
  order.forEach((id, i) => {
    const b = blocks[id];
    const next = blocks[order[i + 1]];
    const listy = (t) => t === 'bullet' || t === 'number';
    switch (b.type) {
      case 'table': {
        const rows = b.rows?.length ? b.rows : [['']];
        const width = Math.max(...rows.map((r) => r.length));
        const pad = (r) => [...r, ...Array(width - r.length).fill('')];
        out.push(`| ${pad(rows[0]).map(cell).join(' | ')} |`, `|${' --- |'.repeat(width)}`);
        rows.slice(1).forEach((r) => out.push(`| ${pad(r).map(cell).join(' | ')} |`));
        break;
      }
      case 'image': out.push(`![${b.alt || 'image'}](${b.src || ''})`); break;
      case 'divider': out.push('---'); break;
      case 'code': out.push('```', b.text || '', '```'); break;
      case 'number': out.push(`${nums[id]}. ${b.text || ''}`); break;
      case 'quote': out.push(...String(b.text || '').split('\n').map((l) => `> ${l}`)); break;
      default: out.push(`${PREFIX[b.type] || ''}${b.text || ''}`);
    }
    if (!(listy(b.type) && next && listy(next.type))) out.push('');
  });
  return `${out.join('\n').trim()}\n`;
}

const TABLE_SEP = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

/** Markdown text -> a list of new blocks (no ids yet). */
export function markdownToBlocks(markdown) {
  const lines = String(markdown || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let para = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join(' ') });
    para = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { flush(); continue; }
    if (t.startsWith('```')) {
      flush();
      const body = [];
      for (i += 1; i < lines.length && !lines[i].trim().startsWith('```'); i += 1) body.push(lines[i]);
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    if (t.startsWith('|') && TABLE_SEP.test(lines[i + 1]?.trim() || '')) {
      flush();
      const rows = [splitRow(t)];
      for (i += 2; i < lines.length && lines[i].trim().startsWith('|'); i += 1) rows.push(splitRow(lines[i]));
      i -= 1;
      blocks.push({ type: 'table', rows });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(t);
    const image = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(t);
    const bullet = /^[-*+]\s+(.*)$/.exec(t);
    const number = /^\d+[.)]\s+(.*)$/.exec(t);
    if (heading) { flush(); blocks.push({ type: `h${Math.min(3, heading[1].length)}`, text: heading[2] }); }
    else if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flush(); blocks.push({ type: 'divider' }); }
    else if (image) { flush(); blocks.push({ type: 'image', alt: image[1], src: image[2] }); }
    else if (bullet) { flush(); blocks.push({ type: 'bullet', text: bullet[1] }); }
    else if (number) { flush(); blocks.push({ type: 'number', text: number[1] }); }
    else if (t.startsWith('>')) {
      flush();
      const prev = blocks[blocks.length - 1];
      const text = t.replace(/^>\s?/, '');
      if (prev?.type === 'quote' && lines[i - 1]?.trim().startsWith('>')) prev.text += `\n${text}`;
      else blocks.push({ type: 'quote', text });
    } else para.push(t);
  }
  flush();
  return blocks;
}
