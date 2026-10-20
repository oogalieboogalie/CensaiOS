/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';

const logLines = [];
jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({
  logToApp: (level, message, options) => logLines.push({ level, message, options }),
}));
jest.unstable_mockModule('../src/components/docker/dockerApi.js', () => ({
  dockerApi: {
    inspect: async () => ({
      image: 'nginx:alpine', command: '', created: '', restartPolicy: 'no', restartCount: 0, workingDir: '',
      state: { running: true, startedAt: '', pid: 42, error: '' },
      health: null,
      ports: [{ target: '80/tcp', published: ['0.0.0.0:8080'] }, { target: '53/udp', published: ['0.0.0.0:5353'] }],
      mounts: [], networks: [], env: [],
    }),
  },
  formatBytes: String, formatPercent: String, formatRate: String,
}));

const { isThisPc, openLinkFor, publishedPort } = await import('../src/components/docker/openLink.js');
const { OverviewView } = await import('../src/components/docker/ContainerInfo.jsx');

beforeEach(() => { logLines.length = 0; });

describe('Docker Open link', () => {
  test('on this PC it points at localhost', () => {
    for (const hostname of ['localhost', '127.0.0.1', '::1', 'tauri.localhost']) {
      expect(isThisPc(hostname)).toBe(true);
      expect(openLinkFor('0.0.0.0:8080', { hostname })).toBe('http://localhost:8080');
    }
  });

  test('on a board opened at another address it points at that address', () => {
    expect(openLinkFor('0.0.0.0:8080', { hostname: 'homebase.test' })).toBe('http://homebase.test:8080');
    expect(openLinkFor('[::]:8080', { hostname: '192.168.1.20' })).toBe('http://192.168.1.20:8080');
    expect(openLinkFor('8080', { hostname: 'fd00::5' })).toBe('http://[fd00::5]:8080');
  });

  test('a binding with no real port gives no link', () => {
    expect(publishedPort('0.0.0.0:')).toBe('');
    expect(publishedPort('0.0.0.0:99999')).toBe('');
    expect(openLinkFor('nonsense', { hostname: 'homebase.test' })).toBe('');
  });

  test('the Overview Open link uses the page host and logs the port only', async () => {
    render(<OverviewView container={{ id: 'c1', state: 'running' }} />);
    const open = await screen.findByText('Open');
    // jsdom serves the page from localhost, so this is the "this PC" case.
    expect(open.getAttribute('href')).toBe('http://localhost:8080');
    expect(screen.getAllByText('Open')).toHaveLength(1);
    fireEvent.click(open);
    expect(logLines).toEqual([{ level: 'info', message: 'docker: opened port 8080 on this PC', options: { where: 'docker' } }]);
  });
});

test('an Open on another address logs that, with the port only', async () => {
  const { logOpen } = await import('../src/components/docker/openLink.js');
  logLines.length = 0;
  logOpen('0.0.0.0:8080', { hostname: 'homebase.test' });
  expect(logLines[0].message).toBe('docker: opened port 8080 on another address');
});
