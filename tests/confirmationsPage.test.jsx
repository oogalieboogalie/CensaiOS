/**
 * @jest-environment jsdom
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfirmationsView } from '../src/components/windows/confirmations/view.jsx';
import { ConfirmationsWindow } from '../src/components/windows/confirmations/index.jsx';

const ask = {
  id: 'ask-1',
  title: 'The shop DNS record still needs you',
  detail: 'Wave of 11 Nov. Nobody else can change the registrar.',
  actionLabel: 'Mark done',
};

const risky = {
  id: 'pr-12',
  number: 12,
  title: 'Pull request 12 needs you',
  detail: 'It changes dependencies. The merge bot will not merge it.',
  actionLabel: 'Mark pull request 12 handled',
  url: 'https://github.com/acme/widgets/pull/12',
};

describe('needs you window', () => {
  test('an empty list says nothing is waiting', () => {
    render(<ConfirmationsView status="ready" items={[]} />);
    expect(screen.getByText('Nothing waiting for you.')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  test('loading and error are written out, and the error has one next step', () => {
    const { rerender } = render(<ConfirmationsView status="loading" />);
    expect(screen.getByText('Loading the list.')).toBeTruthy();
    const retry = jest.fn();
    rerender(<ConfirmationsView status="error" notice="The list did not load. Try again." onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The list did not load. Try again.');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  test('a filled list has one button per item', () => {
    const done = jest.fn();
    render(<ConfirmationsView status="ready" items={[ask, risky]} onDone={done} />);
    expect(screen.getByText('These are the only things waiting on you.')).toBeTruthy();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Mark done',
      'Mark pull request 12 handled',
    ]);
    const link = screen.getByRole('link', { name: 'Open pull request 12' });
    expect(link).toHaveAttribute('href', 'https://github.com/acme/widgets/pull/12');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    const open = jest.spyOn(window, 'open').mockReturnValue({ opener: window });
    fireEvent.click(link);
    expect(open).toHaveBeenCalledWith('https://github.com/acme/widgets/pull/12', '_blank', 'noopener,noreferrer');
    open.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(done).toHaveBeenCalledWith('ask-1');
  });

  test('a loaded window shows the empty list and a list with one ask', async () => {
    const empty = render(<ConfirmationsWindow load={async () => []} mark={async () => {}} />);
    expect(await screen.findByText('Nothing waiting for you.')).toBeTruthy();
    empty.unmount();

    const mark = jest.fn(async () => {});
    render(<ConfirmationsWindow load={async () => [ask]} mark={mark} />);
    expect(await screen.findByText(ask.title)).toBeTruthy();
    expect(screen.getByText(ask.detail)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    await waitFor(() => expect(mark).toHaveBeenCalledWith('ask-1'));
    expect(await screen.findByText('Nothing waiting for you.')).toBeTruthy();
  });

  test('the screen uses the board colors, a visible focus ring, and left-aligned text', () => {
    const cssPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../src/components/windows/confirmations/confirmations.css',
    );
    const css = fs.readFileSync(cssPath, 'utf8');
    expect(css).toMatch(/text-align:\s*left/);
    expect(css).toMatch(/:focus-visible/);
    expect(css).toMatch(/var\(--ink\)/);
    expect(css).toMatch(/var\(--surface\)/);
    expect(css).toMatch(/min-height:\s*var\(--space-11\)/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css.toLowerCase()).not.toMatch(/purple|indigo|violet|backdrop-filter/);
  });
});
