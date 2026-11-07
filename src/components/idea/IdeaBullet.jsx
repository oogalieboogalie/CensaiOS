import React from 'react';
import { Icon } from '../Icons.jsx';
import { useSharedCaret } from '../../lib/collaboration/useSharedCaret.js';
import { bulletInputStyle, iconButtonStyle } from './ideaBulletsStyles.js';

// One Idea Pad bullet. Its words are saved as you type, and a teammate's
// letters landing in it keep your cursor where it was.
export function IdeaBullet({ idea, index, onChange, onRemove }) {
  const ref = React.useRef(null);
  useSharedCaret(ref, idea);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) 20px', gap: 6, alignItems: 'start' }}>
      <div style={{ width: 7, height: 7, borderRadius: 'var(--radius-full)', background: 'var(--accent)', marginTop: 10, justifySelf: 'center' }} />
      <textarea
        ref={ref}
        aria-label={`Idea bullet ${index + 1}`}
        value={idea}
        onChange={(e) => onChange(index, e.target.value)}
        rows={1}
        style={bulletInputStyle}
      />
      <button onClick={() => onRemove(index)} title="Remove idea" style={iconButtonStyle}>
        <Icon.Close size={10} />
      </button>
    </div>
  );
}
