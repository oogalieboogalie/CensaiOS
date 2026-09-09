import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';

export function RookWindow({ win, onUpdate }) {
  // Authentication belongs to the local OpenClaw gateway, never in source or
  // a shareable workspace payload. The gateway's own UI handles sign-in.
  const url = 'http://localhost:18789/';

  const openConsole = () => {
    window.open(url, '_blank');
  };

  return (
    <>
      <WindowTitle
        icon={<Icon.Bot size={13} style={{ color: 'oklch(0.62 0.14 180)', animation: 'gen-pulse 1.5s infinite ease-in-out' }} />}
        label={win.title || 'Rook (OpenClaw)'}
        subtitle="Local sidecar console"
      />
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface-3, #0b0f19)',
        padding: '24px',
        textAlign: 'center',
        fontFamily: 'var(--font-sans, system-ui)',
        color: 'var(--ink)'
      }}>
        {/* Glow container */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '32px 24px',
          maxWidth: '420px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
          backdropFilter: 'blur(10px)'
        }}>
          {/* Animated Glowing Connection Ring */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, oklch(0.62 0.14 180 / 0.2) 0%, transparent 70%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '2px solid oklch(0.62 0.14 180 / 0.3)',
                animation: 'gen-pulse 2s infinite ease-in-out'
              }} />
              <Icon.Bot size={32} style={{ color: 'oklch(0.62 0.14 180)' }} />
            </div>
          </div>

          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            Rook (OpenClaw) Sidecar
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: '1.5', marginBottom: '24px' }}>
            Open your local gateway on port <code style={{ color: 'var(--accent)', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>18789</code>. OpenClaw will handle authentication in its own console.
          </p>

          {/* Quick Metrics Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '28px',
            textAlign: 'left'
          }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-faint)', marginBottom: '4px' }}>Model Provider</div>
              <div style={{ fontSize: '12px', fontWeight: '500', color: 'oklch(0.62 0.14 180)' }}>Local Ollama</div>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-faint)', marginBottom: '4px' }}>Running Cost</div>
              <div style={{ fontSize: '12px', fontWeight: '500', color: 'oklch(0.75 0.14 140)' }}>100% Free (Offline)</div>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.04)', gridColumn: 'span 2' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-faint)', marginBottom: '4px' }}>Primary Model</div>
              <div style={{ fontSize: '12px', fontWeight: '500', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>minimax-m2.5:cloud</div>
            </div>
          </div>

          {/* Premium Glowing CTA Button */}
          <button
            onClick={openConsole}
            style={{
              width: '100%',
              padding: '12px 20px',
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, oklch(0.62 0.14 180) 0%, oklch(0.55 0.14 200) 100%)',
              color: '#fff',
              fontSize: '13.5px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 15px oklch(0.62 0.14 180 / 0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
              transition: 'transform 0.2s, box-shadow 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 20px oklch(0.62 0.14 180 / 0.4), inset 0 1px 0 rgba(255,255,255,0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 15px oklch(0.62 0.14 180 / 0.3), inset 0 1px 0 rgba(255,255,255,0.2)';
            }}
          >
            <span>⚡ Open Rook Console Workspace</span>
            <Icon.NewWindow size={14} />
          </button>
        </div>
      </div>
    </>
  );
}
