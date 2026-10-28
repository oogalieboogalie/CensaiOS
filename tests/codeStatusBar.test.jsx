/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { CodeStatusBar } from '../src/components/codeEditor/CodeStatusBar.jsx';

describe('Code Editor status bar', () => {
  test('counts lines and characters and names the language', () => {
    render(<CodeStatusBar code={'one\ntwo\nthree'} language="JavaScript" />);
    const bar = screen.getByTestId('code-status');
    expect(bar.textContent).toContain('3 lines');
    expect(bar.textContent).toContain('13 characters');
    expect(bar.textContent).toContain('JavaScript');
  });

  test('says one line, and zero for an empty file', () => {
    const { rerender } = render(<CodeStatusBar code="x" language="Plain text" />);
    expect(screen.getByTestId('code-status').textContent).toContain('1 line1 character');
    rerender(<CodeStatusBar code="" language="Plain text" />);
    expect(screen.getByTestId('code-status').textContent).toContain('0 lines0 characters');
  });
});
