import React from 'react';

function describeWindow(win, type) {
  const label = win?.title || win?.kind || type || 'window';
  return String(label);
}

export class WindowLazyErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('[WindowLazyErrorBoundary] window render failed:', error);
  }

  componentDidUpdate(prevProps) {
    const previousKey = `${prevProps.win?.id || ''}:${prevProps.type || ''}`;
    const nextKey = `${this.props.win?.id || ''}:${this.props.type || ''}`;
    if (this.state.error && previousKey !== nextKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    const message = this.state.error?.message || String(this.state.error);
    return (
      <div
        role="alert"
        style={{
          flex: 1,
          minHeight: 0,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          color: 'var(--ink-soft)',
          background: 'var(--surface)',
          fontSize: 12,
          lineHeight: 1.4,
        }}
      >
        <div style={{ fontWeight: 700, color: 'var(--ink)' }}>
          Could not load {describeWindow(this.props.win, this.props.type)}
        </div>
        <div style={{ color: 'var(--ink-faint)' }}>
          Reload the app or close this window and try opening it again.
        </div>
        <pre style={{
          margin: 0,
          whiteSpace: 'pre-wrap',
          overflow: 'auto',
          color: 'var(--ink-faint)',
          font: '10px/1.4 var(--font-mono)',
        }}>
          {message}
        </pre>
      </div>
    );
  }
}
