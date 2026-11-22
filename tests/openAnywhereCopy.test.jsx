/** @jest-environment jsdom */
// Copy in Open anywhere says "Copied." only when the text really went to the
// clipboard. On a plain Wi-Fi address the browser has no clipboard, and the
// button says so instead.
import { jest } from '@jest/globals';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const ADDRESS = 'http://officepc:3004';
const realWebOs = await import('../src/lib/webOs.js');
jest.unstable_mockModule('../src/lib/webOs.js', () => ({
  ...realWebOs,
  getOpenAnywhere: async () => ({ available: true, open: true, canManage: true, hosts: ['officepc'], port: 3004, address: '' }),
  addressesFor: () => [ADDRESS],
  makePairCode: jest.fn(),
  pairLink: jest.fn(),
  saveOpenAnywhere: jest.fn(),
}));
jest.unstable_mockModule('qrcode', () => ({ default: { toDataURL: jest.fn() } }));

const { OpenAnywhereSection } = await import('../src/components/theme/OpenAnywhereSection.jsx');

const clipboardBefore = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');
function setClipboard(value) {
  Object.defineProperty(globalThis.navigator, 'clipboard', { value, configurable: true });
}

afterEach(() => {
  cleanup();
  if (clipboardBefore) Object.defineProperty(globalThis.navigator, 'clipboard', clipboardBefore);
  else delete globalThis.navigator.clipboard;
});

test('copying an address says Copied. once it is on the clipboard', async () => {
  const writeText = jest.fn(async () => {});
  setClipboard({ writeText });
  render(<OpenAnywhereSection />);
  fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));
  expect(await screen.findByText('Copied.')).toBeTruthy();
  expect(writeText).toHaveBeenCalledWith(ADDRESS);
});

test('with no clipboard, it says to copy by hand instead of Copied.', async () => {
  setClipboard(undefined);
  render(<OpenAnywhereSection />);
  fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));
  expect(await screen.findByText('Copy did not work. Select the text and copy it.')).toBeTruthy();
  expect(screen.queryByText('Copied.')).toBeNull();
});
