import React from 'react';
import { Icon } from '../Icons.jsx';
import { useSharedCaret } from '../../lib/collaboration/useSharedCaret.js';
import { useCaretReporter, useTeammateCarets } from '../../lib/collaboration/useTextCarets.js';
import { TeammateCarets } from '../collaboration/TeammateCarets.jsx';
import { bulletInputStyle, iconButtonStyle } from './ideaBulletsStyles.js';

/** Where a bullet's words sit in the Idea Pad's shared fields. */
export const ideaBulletField = (index) => `ideas/${index}`;

// One Idea Pad bullet. Its words are saved as you type, and a teammate's
// letters landing in it keep your cursor where it was. A teammate typing in
// it shows as a line with their name right at the letter, and your cursor
// goes out to them while you type (only the spot, never the words).
export function IdeaBullet({ idea, index, onChange, onRemove, winId }) {
  const ref = React.useRef(null);
  const field = ideaBulletField(index);
  const live = Boolean(winId);
  useSharedCaret(ref, idea);
  useCaretReporter(ref, winId, field, live);
  const carets = useTeammateCarets(winId, field, live);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) 20px', gap: 6, alignItems: 'start' }}>
      <div style={{ width: 7, height: 7, borderRadius: 'var(--radius-full)', background: 'var(--accent)', marginTop: 10, justifySelf: 'center' }} />
      <div style={{ position: 'relative', display: 'grid', minWidth: 0 }}>
        <textarea
          ref={ref}
          aria-label={`Idea bullet ${index + 1}`}
          value={idea}
          onChange={(e) => onChange(index, e.target.value)}
          rows={1}
          style={bulletInputStyle}
        />
        <TeammateCarets boxRef={ref} carets={carets} text={idea} />
      </div>
      <button onClick={() => onRemove(index)} title="Remove idea" style={iconButtonStyle}>
        <Icon.Close size={10} />
      </button>
    </div>
  );
}
