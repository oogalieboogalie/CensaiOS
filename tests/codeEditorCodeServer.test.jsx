/**
 * @jest-environment jsdom
 *
 * Tests for the CodeEditorWindow code-server iframe mode (self-hosted-iframe slice).
 * Mirrors the matrix's "code-server self-hosted-iframe slice" brief.
 */
import { jest } from '@jest/globals';

// jsdom doesn't provide fetch; stub it so CodeEditorWindow's file-load effect doesn't blow up.
beforeAll(() => {
  global.fetch = jest.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ content: '' }),
    text: () => Promise.resolve('')
  }));
});

// eslint-disable-next-line no-unused-vars
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
// eslint-disable-next-line no-unused-vars
import { CodeEditorWindow } from '../src/components/CodeEditorWindow.jsx';
import { isValidCodeServerUrl, normalizeCodeServerUrl } from '../src/lib/codeServerUrl.js';

const noop = () => {};

async function settleEffects() {
  // Drain pending React effects so the act() warning doesn't fire after the test ends.
  await waitFor(() => {});
}

describe('CodeEditorWindow — code-server iframe mode', () => {
  test('iframe mode: with win.codeServerUrl set, renders the iframe with the right src', async () => {
    render(
      <CodeEditorWindow
        win={{ id: 'w1', codeServerUrl: 'http://localhost:8080' }}
        onUpdate={noop}
      />
    );
    const iframe = document.querySelector('[data-code-server-iframe]');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', 'http://localhost:8080');
    await settleEffects();
  });

  test('regression: without codeServerUrl, textarea renders and iframe is NOT present', async () => {
    render(
      <CodeEditorWindow
        win={{ id: 'w2' }}
        onUpdate={noop}
      />
    );
    const iframe = document.querySelector('[data-code-server-iframe]');
    expect(iframe).not.toBeInTheDocument();
    expect(document.querySelector('textarea')).toBeInTheDocument();
    await settleEffects();
  });

  test('regression: local file mode still renders the Save button', async () => {
    render(
      <CodeEditorWindow
        win={{ id: 'w3', filePath: '/some/local/file.js' }}
        onUpdate={noop}
      />
    );
    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeInTheDocument();
    await settleEffects();
  });

  test('iframe mode: Save button is hidden', async () => {
    render(
      <CodeEditorWindow
        win={{ id: 'w4', codeServerUrl: 'http://localhost:8080', filePath: '/should/be/ignored.js' }}
        onUpdate={noop}
      />
    );
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    await settleEffects();
  });

  test('iframe mode: Preview button is hidden', async () => {
    render(
      <CodeEditorWindow
        win={{ id: 'w5', codeServerUrl: 'http://localhost:8080' }}
        onUpdate={noop}
      />
    );
    expect(screen.queryByRole('button', { name: /preview/i })).not.toBeInTheDocument();
    await settleEffects();
  });

  test('regression: local mode still renders the Preview button', async () => {
    render(
      <CodeEditorWindow
        win={{ id: 'w6' }}
        onUpdate={noop}
      />
    );
    expect(screen.getByRole('button', { name: /preview/i })).toBeInTheDocument();
    await settleEffects();
  });

  test('iframe mode: URL badge is rendered in the title bar', async () => {
    render(
      <CodeEditorWindow
        win={{ id: 'w7', codeServerUrl: 'http://localhost:8080' }}
        onUpdate={noop}
      />
    );
    const badge = document.querySelector('[data-code-server-url-badge]');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe('http://localhost:8080');
    await settleEffects();
  });

  test('iframe mode: Settings panel toggle still works', async () => {
    render(
      <CodeEditorWindow
        win={{ id: 'w8', codeServerUrl: 'http://localhost:8080' }}
        onUpdate={noop}
      />
    );
    const settingsButton = screen.getByTitle(/editor theme settings/i);
    fireEvent.click(settingsButton);
    expect(screen.getByText(/editor theme/i)).toBeInTheDocument();
    await settleEffects();
  });
});

describe('codeServerUrl helpers', () => {
  test('isValidCodeServerUrl accepts valid http URLs', () => {
    expect(isValidCodeServerUrl('http://localhost:8080')).toBe(true);
    expect(isValidCodeServerUrl('https://code.example.com')).toBe(true);
  });

  test('isValidCodeServerUrl rejects malformed input', () => {
    expect(isValidCodeServerUrl('')).toBe(false);
    expect(isValidCodeServerUrl(null)).toBe(false);
    expect(isValidCodeServerUrl(undefined)).toBe(false);
    expect(isValidCodeServerUrl(42)).toBe(false);
    expect(isValidCodeServerUrl('not-a-url')).toBe(false);
    expect(isValidCodeServerUrl('ftp://example.com')).toBe(false);
  });

  test('normalizeCodeServerUrl strips trailing slashes', () => {
    expect(normalizeCodeServerUrl('http://localhost:8080/')).toBe('http://localhost:8080');
    expect(normalizeCodeServerUrl('http://localhost:8080///')).toBe('http://localhost:8080');
    expect(normalizeCodeServerUrl('http://localhost:8080')).toBe('http://localhost:8080');
  });

  test('normalizeCodeServerUrl handles edge cases', () => {
    expect(normalizeCodeServerUrl('')).toBe('');
    expect(normalizeCodeServerUrl(null)).toBe('');
    expect(normalizeCodeServerUrl(undefined)).toBe('');
    expect(normalizeCodeServerUrl('  http://localhost:8080/  ')).toBe('http://localhost:8080');
  });
});
