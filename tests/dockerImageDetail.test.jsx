/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';

const asked = [];
jest.unstable_mockModule('../src/components/docker/dockerApi.js', () => ({
  dockerApi: {
    imageHistory: async (ref) => {
      asked.push(ref);
      if (ref === 'gone:1') throw new Error('No such image');
      return {
        ref, id: 'aaaabbbbcccc', tags: [ref], created: '2026-10-20T10:00:00Z', os: 'linux', arch: 'amd64', size: 2048,
        inUseBy: ['made-up-web'],
        layers: [
          { id: 'aaaabbbbcccc', createdSince: '2 days ago', step: 'CMD ["node","server.js"]', size: 0 },
          { id: '', createdSince: '2 days ago', step: 'RUN npm ci', size: 2048 },
        ],
      };
    },
  },
  formatBytes: (n) => `${n} B`,
}));

const { ImageDetail } = await import('../src/components/docker/ImageDetail.jsx');

describe('Docker image detail', () => {
  test('shows the layers newest first, the system and who uses it', async () => {
    const onClose = jest.fn();
    render(<ImageDetail imageRef="made-up/app:1" onClose={onClose} />);
    expect(await screen.findByText('RUN npm ci')).toBeTruthy();
    expect(asked).toContain('made-up/app:1');
    const steps = [...document.querySelectorAll('.dk-layer-step')].map((n) => n.textContent);
    expect(steps).toEqual(['CMD ["node","server.js"]', 'RUN npm ci']);
    expect(screen.getByText('linux / amd64')).toBeTruthy();
    expect(screen.getByText('made-up-web')).toBeTruthy();
    expect(screen.getByText('2048 B in 2 layers')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  test('says so when the image cannot be read', async () => {
    render(<ImageDetail imageRef="gone:1" onClose={() => {}} />);
    expect(await screen.findByText('No such image')).toBeTruthy();
  });
});
