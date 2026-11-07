import React from 'react';

// Teammates' cursors drawn inside a text box: a thin line in their colour at
// the spot they are typing, with their name on a small tag. Sits in a
// wrapper with `position: relative` right after the box (`boxRef`). The
// spot is measured with a hidden copy of the box that holds the words up to
// the cursor, so wrapped lines and scrolling land it in the right place.

const COPY_STYLES = [
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
  'textTransform', 'textIndent', 'tabSize', 'wordSpacing',
];

/** Where `index` sits inside `box`, in the box's own pixels: { left, top, height }. */
export function measureCaret(box, index) {
  const style = window.getComputedStyle(box);
  // A one-line box (an <input>) never wraps, and shows its line in the middle.
  const oneLine = box.tagName === 'INPUT';
  const copy = document.createElement('div');
  for (const key of COPY_STYLES) copy.style[key] = style[key];
  // The box's inner width, without any scrollbar, so lines wrap at the same letters
  // (a box that never wraps, like Git Diff's, keeps its lines whole).
  Object.assign(copy.style, {
    boxSizing: 'content-box', borderStyle: 'none',
    width: `${Math.max(0, box.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0))}px`,
    position: 'absolute', visibility: 'hidden', top: '0', left: '0',
    whiteSpace: oneLine || style.whiteSpace === 'pre' ? 'pre' : 'pre-wrap', overflowWrap: 'break-word', overflow: 'hidden',
  });
  copy.textContent = box.value.slice(0, index);
  const mark = document.createElement('span');
  mark.textContent = box.value.slice(index) || '.';
  copy.appendChild(mark);
  (box.parentNode || document.body).appendChild(copy);
  const fontSize = parseFloat(style.fontSize) || 14;
  const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.4;
  try {
    return {
      left: mark.offsetLeft + box.clientLeft - box.scrollLeft,
      top: oneLine ? box.clientTop + Math.max(0, (box.clientHeight - lineHeight) / 2) : mark.offsetTop + box.clientTop - box.scrollTop,
      height: lineHeight,
    };
  } finally {
    copy.remove();
  }
}

export function TeammateCarets({ boxRef, carets, text }) {
  const [places, setPlaces] = React.useState([]);
  const [scrolled, setScrolled] = React.useState(0);
  React.useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const onScroll = () => setScrolled((n) => n + 1);
    box.addEventListener('scroll', onScroll);
    return () => box.removeEventListener('scroll', onScroll);
  }, [boxRef]);
  React.useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || !carets.length) { setPlaces([]); return; }
    const seen = carets.map((c) => ({ ...c, ...measureCaret(box, Math.min(c.index, box.value.length)) }));
    // A cursor scrolled out of the box is not drawn over the words around it.
    // Nor one scrolled sideways out of a box that never wraps.
    setPlaces(seen.filter((c) => c.top > -c.height && c.top < Math.max(box.clientHeight, c.height)
      && (box.clientWidth === 0 || (c.left >= 0 && c.left <= box.clientLeft + box.clientWidth))));
  }, [boxRef, carets, text, scrolled]);
  if (!places.length) return null;
  return (
    <div className="hb-text-carets">
      {places.map((c) => (
        <div key={c.clientId} className="hb-text-caret" data-teammate-caret={c.name} data-at={c.index} data-tag-below={c.top < c.height ? 'true' : undefined}
          style={{ '--caret-color': c.color, transform: `translate(${c.left}px, ${c.top}px)`, height: c.height }}>
          <span className="hb-text-caret__tag">{c.name}</span>
        </div>
      ))}
    </div>
  );
}
