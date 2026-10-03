/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { WebviewShellWindow, WHATSAPP_WEB_URL } from '../src/components/WebviewShellWindow.jsx';
import { WhatsAppWindow } from '../src/components/WhatsAppWindow.jsx';
import { FACTORY_WINDOW_MANIFESTS } from '../src/lib/manifest/factoryWindows.js';

describe('WebviewShellWindow', () => {
  test('renders the given URL in a webview-marked frame', () => {
    const { container } = render(<WebviewShellWindow win={{ url: 'https://example.com' }} onUpdate={jest.fn()} />);
    const frame = container.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame.getAttribute('src')).toBe('https://example.com');
    expect(container.querySelector('[data-embed-mode="webview"]')).not.toBeNull();
  });

  test('URL bar normalizes and persists the new URL', () => {
    const onUpdate = jest.fn();
    render(<WebviewShellWindow win={{}} onUpdate={onUpdate} />);
    fireEvent.change(screen.getByLabelText('Webview URL'), { target: { value: 'web.whatsapp.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onUpdate).toHaveBeenCalledWith({ url: 'https://web.whatsapp.com' });
    expect(screen.getByLabelText('Webview URL').value).toBe('https://web.whatsapp.com');
  });

  test('Re-authenticate remounts the frame without changing the URL', () => {
    const { container } = render(<WebviewShellWindow win={{ url: 'https://example.com' }} onUpdate={jest.fn()} />);
    const before = container.querySelector('iframe');
    fireEvent.click(screen.getByRole('button', { name: 'Re-authenticate' }));
    const after = container.querySelector('iframe');
    expect(after.getAttribute('src')).toBe('https://example.com');
    expect(after).not.toBe(before);
  });

  test('empty state prompts for a URL', () => {
    render(<WebviewShellWindow win={{}} onUpdate={jest.fn()} />);
    expect(screen.getByText(/Enter a URL above/)).toBeInTheDocument();
  });
});

describe('WhatsAppWindow', () => {
  test('pre-fills WhatsApp Web in the shared shell', () => {
    const { container } = render(<WhatsAppWindow win={{}} onUpdate={jest.fn()} />);
    expect(container.querySelector('iframe').getAttribute('src')).toBe(WHATSAPP_WEB_URL);
  });

  test('manifest registers both webview windows', () => {
    const shell = FACTORY_WINDOW_MANIFESTS.find((m) => m.kind === 'webviewShell');
    const app = FACTORY_WINDOW_MANIFESTS.find((m) => m.kind === 'whatsapp');
    expect(shell).toMatchObject({ componentName: 'WebviewShellWindow', embedMode: 'webview' });
    expect(app).toMatchObject({
      componentName: 'WhatsAppWindow',
      componentPath: 'src/components/WhatsAppWindow.jsx',
      label: 'WhatsApp',
      embedMode: 'webview',
    });
  });
});
