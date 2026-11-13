import { DOCK } from './dockMetrics.js';

export function DockDivider() {
  return <div data-dock-divider style={{ width: 1, height: DOCK.divider, background: 'var(--hairline)', margin: '0 2px' }} />;
}
