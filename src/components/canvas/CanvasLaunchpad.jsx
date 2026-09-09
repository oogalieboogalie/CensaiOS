/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { CanvasOutcomeCommand } from './CanvasOutcomeCommand.jsx';

export function CanvasLaunchpad({ manifests, onSpawn }) {
  const canSpawn = typeof onSpawn === 'function';
  const startOutcome = prompt => {
    if (!canSpawn) return;
    onSpawn('chat', {
      agentId: 'censai',
      msgs: [{ from: 'me', text: prompt }],
      autoSend: true,
    });
  };

  return (
    <div data-testid="canvas-launchpad" style={{
      position: 'absolute', left: -280, top: -270, width: 560,
      maxWidth: 'calc(100vw - 40px)', pointerEvents: 'auto', textAlign: 'center',
    }}>
      <img src="/assets/logolite.png" alt="Censai" style={{
        display: 'block', width: 176, height: 'auto', margin: '0 auto',
        filter: 'drop-shadow(0 8px 24px rgba(8, 16, 216, 0.10))',
      }} />
      <h1 style={{
        margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)',
        fontSize: 32, fontWeight: 650, lineHeight: 1.12, letterSpacing: '-0.025em',
      }}>Welcome — let’s get cooking.</h1>
      <p style={{
        margin: '8px 0 0', color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1.45,
      }}>Browse the module menu and piece together your station, or use the chat box below to describe what you want to do and let Censai suggest modules that fit your needs.</p>
      <CanvasOutcomeCommand onSubmit={canSpawn ? startOutcome : undefined} />
      <div style={{
        marginTop: 17, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)',
        fontSize: 10, letterSpacing: '0.035em', lineHeight: 1.6,
      }}>
        Open a project from the top bar · drag to pan · Ctrl+scroll to zoom
      </div>
    </div>
  );
}
