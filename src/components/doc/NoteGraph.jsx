import React from 'react';

export function NoteGraph({ current, backlinks, outlinks, onNodeClick }) {
  const width = 600;
  const height = 400;
  const centerX = width / 2;
  const centerY = height / 2;

  // Place current in center, others in a circle
  const nodes = [
    { ...current, x: centerX, y: centerY, isCurrent: true },
    ...backlinks.map((b, i) => {
      const angle = (i / (backlinks.length + outlinks.length)) * Math.PI * 2;
      return { ...b, x: centerX + Math.cos(angle) * 120, y: centerY + Math.sin(angle) * 120, isBacklink: true };
    }),
    ...outlinks.map((o, i) => {
      const angle = ((i + backlinks.length) / (backlinks.length + outlinks.length)) * Math.PI * 2;
      return { ...o, x: centerX + Math.cos(angle) * 120, y: centerY + Math.sin(angle) * 120, isOutlink: true };
    })
  ];

  return (
    <div style={{ flex: 1, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Links */}
        {nodes.filter(n => !n.isCurrent).map((n, i) => (
          <line key={i} x1={centerX} y1={centerY} x2={n.x} y2={n.y} stroke="var(--hairline-strong)" strokeWidth="1" strokeDasharray={n.isBacklink ? "4 2" : "0"} />
        ))}
        {/* Nodes */}
        {nodes.map((n, i) => (
          <g key={i} onClick={() => onNodeClick(n)} style={{ cursor: 'pointer' }}>
            <circle cx={n.x} cy={n.y} r={n.isCurrent ? 8 : 5} fill={n.isCurrent ? 'var(--accent)' : 'var(--surface)'} stroke={n.isCurrent ? 'var(--accent)' : 'var(--hairline-strong)'} strokeWidth="2" />
            <text x={n.x} y={n.y + 20} textAnchor="middle" fontSize="10" fill="var(--ink-soft)" fontFamily="var(--font-mono)">{n.name}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
