/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';

const saveWorkspace = jest.fn();
const clearWorkspaceDraft = jest.fn();
const downloadWorkspaceSnapshot = jest.fn();

jest.unstable_mockModule('../src/lib/api.js', () => ({
  api: { saveWorkspace, clearWorkspaceDraft, downloadWorkspaceSnapshot },
}));

const { WorkspaceRecovery, PersistencePill, DraftRestoreBar } = await import('../src/components/WorkspaceRecovery.jsx');

describe('workspace recovery surfaces', () => {
  beforeEach(() => jest.clearAllMocks());

  test('a legacy browser copy is inert until explicit restore', async () => {
    saveWorkspace.mockResolvedValue({ revision: 1 });
    const onRetry = jest.fn();
    render(<WorkspaceRecovery load={{
      status: 'restore_required', value: { wins: ['legacy'] }, revision: 0,
    }} onRetry={onRetry} />);

    expect(saveWorkspace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Restore recovery copy' }));
    await waitFor(() => expect(saveWorkspace).toHaveBeenCalledWith({ wins: ['legacy'] }, 0));
    expect(onRetry).toHaveBeenCalled();
  });

  test('unavailable state offers retry and never initializes', () => {
    const onRetry = jest.fn();
    render(<WorkspaceRecovery load={{ status: 'unavailable', error: new Error('offline') }} onRetry={onRetry} />);
    expect(screen.getByText('The server did not answer')).toBeInTheDocument();
    expect(saveWorkspace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('persistence pill stays quiet on success and offers retry on degraded', () => {
    const { unmount } = render(
      <PersistencePill persistence={{ status: 'saved', error: '', retry: jest.fn(), download: jest.fn() }} />
    );
    expect(document.querySelector('[role="status"]')).toBeNull();
    unmount();

    const persistence = { status: 'degraded', error: 'HTTP 502', retry: jest.fn(), download: jest.fn() };
    render(<PersistencePill persistence={persistence} />);
    expect(screen.getByText('HTTP 502')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(persistence.retry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(persistence.download).toHaveBeenCalledTimes(1);
  });

  test('conflict pill omits retry and offers reload instead', () => {
    const persistence = { status: 'conflict', error: 'changed', retry: jest.fn(), download: jest.fn() };
    render(<PersistencePill persistence={persistence} />);
    expect(screen.queryByRole('button', { name: 'Retry now' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload server copy' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(persistence.download).toHaveBeenCalled();
  });

  test('draft restore bar wires restore, download, and discard', () => {
    const handlers = { onRestore: jest.fn(), onDownload: jest.fn(), onDiscard: jest.fn() };
    render(<DraftRestoreBar savedAt="Sep 6, 2:33 PM" {...handlers} />);
    expect(screen.getByText(/newer unsaved draft/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(handlers.onRestore).toHaveBeenCalledTimes(1);
    expect(handlers.onDownload).toHaveBeenCalledTimes(1);
    expect(handlers.onDiscard).toHaveBeenCalledTimes(1);
  });
});
