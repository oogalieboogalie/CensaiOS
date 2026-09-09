import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from './Icons.jsx';

const CommandPalette = ({ show, onClose, commands }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredCommands = useMemo(() => {
    if (!searchTerm) {
      return commands;
    }
    return commands.filter(command =>
      command.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, commands]);

  useEffect(() => {
    if (!show) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [show, selectedIndex, filteredCommands, onClose]);

  useEffect(() => {
    if (show) {
      setSearchTerm('');
      setSelectedIndex(0);
    }
  }, [show]);
  
  if (!show) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'oklch(0 0 0 / 0.5)',
      zIndex: 100,
      display: 'flex',
      justifyContent: 'center',
      paddingTop: '20vh'
    }} onClick={onClose}>
      <div style={{
        width: '100%',
        maxWidth: '600px',
        background: 'var(--surface)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-pop)',
        border: '1px solid var(--hairline)',
        overflow: 'hidden'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '12px', borderBottom: '1px solid var(--hairline)' }}>
          <input
            type="text"
            placeholder="Search commands..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: '16px',
              color: 'var(--ink)'
            }}
          />
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: '8px', maxHeight: '400px', overflowY: 'auto' }}>
          {filteredCommands.map((command, index) => (
            <li
              key={command.name}
              onClick={() => {
                command.action();
                onClose();
              }}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-pill)',
                cursor: 'pointer',
                background: index === selectedIndex ? 'var(--accent-soft)' : 'transparent',
                color: index === selectedIndex ? 'var(--accent-ink)' : 'var(--ink)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              {command.icon}
              {command.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default CommandPalette;
