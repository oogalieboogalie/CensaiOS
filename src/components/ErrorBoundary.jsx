import React from 'react';

// Surfaces otherwise-invisible render errors. Without this, an uncaught render
// throw makes React 18 unmount the whole tree -> blank white page with the real
// error hidden in the console. This paints the error + component stack on screen.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] render crash:', error, info);
  }
  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ position: 'fixed', inset: 0, overflow: 'auto', background: '#1a0000', color: '#ffd7d7', font: '12px/1.5 monospace', padding: 24, zIndex: 999999 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#ff6b6b' }}>App crashed during render</div>
        <div style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>{String(error && (error.stack || error.message || error))}</div>
        <div style={{ color: '#ff9b9b', whiteSpace: 'pre-wrap' }}>{info && info.componentStack}</div>
      </div>
    );
  }
}
