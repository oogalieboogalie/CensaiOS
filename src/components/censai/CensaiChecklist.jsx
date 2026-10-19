import { itemMark, itemWord } from '../../lib/censai/plans.js';

// A job's checklist: each item with its mark and the plain line that says
// how Censai checked it (tests run, file found, answer read) or why it could
// not, with the test output one more tap away.
export function CensaiChecklist({ items = [] }) {
  if (!items.length) return null;
  return (
    <ul className="hb-plan-list">
      {items.map((item) => (
        <li key={item.n} data-state={item.state}>
          <span className="hb-plan-mark" aria-hidden="true">{itemMark(item.state)}</span>
          <span className="hb-plan-item">
            <span className="hb-sr-only">{itemWord(item.state)}: </span>
            <span className="hb-plan-item-text">{item.text}</span>
            {item.line && item.state !== 'open' && <span className="hb-plan-line">{item.line}</span>}
            {item.detail && (
              <details className="hb-plan-more">
                <summary>Test output</summary>
                <pre>{item.detail}</pre>
              </details>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
