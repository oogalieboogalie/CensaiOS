/** @jest-environment jsdom */
// eslint-disable-next-line no-unused-vars
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
// eslint-disable-next-line no-unused-vars
import { ImportA2ACard } from '../src/components/registry/ImportA2ACard.jsx';

describe('Registry A2A import control', () => {
  test('imports a card and reports whether it is executable', async () => {
    const card = { id: 'ext:a2a:abc', name: 'Research Agent' };
    const client = { importA2A: jest.fn(async () => ({
      card, executable: true, protocolVersion: '0.3.0',
    })) };
    const onImported = jest.fn();
    render(<ImportA2ACard client={client} onImported={onImported} canImport />);
    fireEvent.change(screen.getByTestId('registry-a2a-url'), {
      target: { value: 'https://agent.example/.well-known/agent-card.json' },
    });
    fireEvent.click(screen.getByTestId('registry-a2a-submit'));
    await waitFor(() => expect(client.importA2A).toHaveBeenCalledWith(
      'https://agent.example/.well-known/agent-card.json'
    ));
    expect(await screen.findByRole('status')).toHaveTextContent('ready to call');
    expect(onImported).toHaveBeenCalledWith(card);
  });

  test('keeps non-admin controls disabled and surfaces adapter errors', async () => {
    const deniedClient = { importA2A: jest.fn() };
    const { rerender } = render(
      <ImportA2ACard client={deniedClient} canImport={false} />
    );
    fireEvent.change(screen.getByTestId('registry-a2a-url'), {
      target: { value: 'https://agent.example/card' },
    });
    expect(screen.getByTestId('registry-a2a-submit')).toBeDisabled();
    expect(deniedClient.importA2A).not.toHaveBeenCalled();

    const failingClient = { importA2A: jest.fn(async () => {
      throw new Error('External agent target is blocked by egress policy.');
    }) };
    rerender(<ImportA2ACard client={failingClient} canImport />);
    fireEvent.change(screen.getByTestId('registry-a2a-url'), {
      target: { value: 'https://agent.example/card' },
    });
    fireEvent.click(screen.getByTestId('registry-a2a-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent('blocked by egress policy');
  });
});
