import React, { useState } from 'react';
import { ROADMAP_ITEMS, TIMELINE_START, TIMELINE_END } from '../data/roadmap-data.js';

export function RoadmapTimeline() {
  const [hoveredId, setHoveredId] = useState(null);

  const startMs = new Date(TIMELINE_START).getTime();
  const endMs = new Date(TIMELINE_END).getTime();
  const totalDuration = endMs - startMs;

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      width: '100%',
      maxWidth: 640,
      padding: '0 24px',
      zIndex: 40,
      pointerEvents: 'none', // let clicks pass through the background
    }}>
      {/* Background pill to contain the timeline nicely */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        borderRadius: 24,
        padding: '16px 24px',
        boxShadow: 'var(--shadow-card)',
        pointerEvents: 'auto', // re-enable pointer events for the container
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        height: 52, // Fixed height to contain absolute elements
      }}>
        
        {/* The horizontal track line */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 48,
          right: 48,
          height: 2,
          background: 'var(--hairline)',
          transform: 'translateY(-50%)',
          zIndex: 1,
        }} />

        {/* The nodes container */}
        <div style={{
          position: 'absolute',
          top: 0, bottom: 0,
          left: 48, right: 48,
          zIndex: 2,
        }}>
          {ROADMAP_ITEMS.map((item) => {
            const itemMs = new Date(item.date).getTime();
            // clamp percentage between 0 and 100
            let percent = ((itemMs - startMs) / totalDuration) * 100;
            percent = Math.max(0, Math.min(100, percent));

            const isCompleted = item.status === 'completed';
            const isInProgress = item.status === 'in-progress';
            
            // Determine colors
            const nodeBg = isCompleted ? 'var(--accent)' : (isInProgress ? 'var(--surface)' : 'var(--surface-2)');
            const nodeBorder = isCompleted ? 'var(--accent)' : (isInProgress ? 'var(--accent)' : 'var(--hairline)');
            const nodePulse = isInProgress ? '0 0 0 4px oklch(var(--accent-l) calc(var(--accent-c) * 0.5) var(--accent-h) / 0.2)' : 'none';

            return (
              <div 
                key={item.id}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ 
                  position: 'absolute', 
                  left: `${percent}%`, 
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center' 
                }}
              >
                {/* Tooltip / Popover */}
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  marginBottom: 16,
                  width: 220,
                  background: 'var(--surface)',
                  border: '1px solid var(--hairline)',
                  borderRadius: 12,
                  padding: '12px',
                  boxShadow: 'var(--shadow-pop)',
                  opacity: hoveredId === item.id ? 1 : 0,
                  transform: `translateY(${hoveredId === item.id ? '0' : '4px'})`,
                  pointerEvents: hoveredId === item.id ? 'auto' : 'none',
                  transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
                  zIndex: 50,
                  textAlign: 'left',
                }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent-ink)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
                    {item.phase}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--ink)', marginBottom: 6, lineHeight: 1.2 }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.4 }}>
                    {item.description}
                  </div>
                  
                  {/* Tooltip Arrow */}
                  <div style={{
                    position: 'absolute',
                    bottom: -5,
                    left: '50%',
                    transform: 'translateX(-50%) rotate(45deg)',
                    width: 8,
                    height: 8,
                    background: 'var(--surface)',
                    borderRight: '1px solid var(--hairline)',
                    borderBottom: '1px solid var(--hairline)',
                  }} />
                </div>

                {/* The Timeline Node */}
                <div style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: nodeBg,
                  border: `2px solid ${nodeBorder}`,
                  boxShadow: nodePulse,
                  cursor: 'pointer',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  transform: hoveredId === item.id ? 'scale(1.2)' : 'scale(1)',
                }} />
                
                {/* Small label below node */}
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  marginTop: 6,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: (isCompleted || isInProgress) ? 'var(--ink)' : 'var(--ink-faint)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                }}>
                  {item.phase}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
