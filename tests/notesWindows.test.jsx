/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { VaultNotesWindow } from '../src/components/windows/vaultNotes/index.jsx';
import { FinderFilesWindow } from '../src/components/windows/finderFiles/index.jsx';

describe('vaultNotes window', () => {
  test('shows Bases sidebar, recipe tab and editable note body', () => {
    const onUpdate = jest.fn();
    render(<VaultNotesWindow win={{}} onUpdate={onUpdate} />);
    expect(screen.getByTestId('vault-notes')).toBeTruthy();
    expect(screen.getByText('Bases')).toBeTruthy();
    expect(screen.getByText('Recipes')).toBeTruthy();
    expect(screen.getByLabelText('Brown butter nectarine tart')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Brown butter nectarine tart'), {
      target: { value: '- tasting notes' },
    });
    expect(onUpdate).toHaveBeenCalledWith({ text: '- tasting notes' });
  });
});

describe('finderFiles window', () => {
  test('shows Downloads zebra list and sidebar sections', () => {
    render(<FinderFilesWindow win={{}} onUpdate={() => {}} />);
    expect(screen.getByTestId('finder-files')).toBeTruthy();
    expect(screen.getByText('Favorites')).toBeTruthy();
    expect(screen.getByText('Tags')).toBeTruthy();
    expect(screen.getByText('Brown butter nectarine tart.md')).toBeTruthy();
    expect(screen.getByLabelText('Downloads files')).toBeTruthy();
  });
});
