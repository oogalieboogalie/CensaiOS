import { Icon } from '../Icons.jsx';
import { logToApp } from '../../lib/appLog/browserLog.js';

function stop(event) { event.stopPropagation(); }

// A blank block says what belongs here and offers the one action that fills it.
export function DesignBlockEmpty({ onOpenCode }) {
  const open = (event) => {
    stop(event);
    logToApp('info', 'design-block: opened the code from an empty block', { where: 'design-block' });
    onOpenCode();
  };

  return (
    <div className="hb-db-stage">
      <div className="hb-panel hb-lift hb-db-card">
        <div className="hb-empty">
          <span className="hb-empty-icon" aria-hidden="true"><Icon.Code size={18} /></span>
          <span className="hb-empty-title">Nothing on this block yet</span>
          <span className="hb-empty-text">
            Paste HTML, Tailwind, JSX or SVG on the canvas, or open the code and start writing.
          </span>
          <div className="hb-empty-actions">
            <button type="button" className="hb-db-btn hb-press" data-primary="true" onClick={open} onPointerDown={stop}>
              Open the code
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
