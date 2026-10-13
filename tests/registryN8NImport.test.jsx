/** @jest-environment jsdom */
// eslint-disable-next-line no-unused-vars
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
// eslint-disable-next-line no-unused-vars
import { ImportN8NChatCard } from '../src/components/registry/ImportN8NChatCard.jsx';

function fill() {
  fireEvent.change(screen.getByTestId('registry-n8n-name'), {
    target: { value: 'Research workflow' },
  });
  fireEvent.change(screen.getByTestId('registry-n8n-description'), {
    target: { value: 'Researches a topic.' },
  });
  fireEvent.change(screen.getByTestId('registry-n8n-url'), {
    target: { value: 'https://n8n.example/webhook/chat' },
  });
}

describe('Registry n8n import control', () => {
  test('warns about executions and imports without claiming an import probe', async () => {
    const card = { id: 'ext:n8n:abc', name: 'Research workflow' };
    const client = { importN8NChat: jest.fn(async () => ({ card })) };
    const onImported = jest.fn();
    render(<ImportN8NChatCard client={client} onImported={onImported} canImport />);
    expect(screen.getByText(/may consume one n8n execution/i)).toBeInTheDocument();
    expect(screen.getByText(/Import does not run it/i)).toBeInTheDocument();
    fill();
    fireEvent.click(screen.getByTestId('registry-n8n-submit'));
    await waitFor(() => expect(client.importN8NChat).toHaveBeenCalledWith({
      name: 'Research workflow', description: 'Researches a topic.',
      webhookUrl: 'https://n8n.example/webhook/chat',
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('verified on its first call');
    expect(onImported).toHaveBeenCalledWith(card);
  });

  test('keeps non-admin controls disabled and surfaces adapter errors', async () => {
    const deniedClient = { importN8NChat: jest.fn() };
    const { rerender } = render(
      <ImportN8NChatCard client={deniedClient} canImport={false} />
    );
    fill();
    expect(screen.getByTestId('registry-n8n-submit')).toBeDisabled();
    expect(deniedClient.importN8NChat).not.toHaveBeenCalled();

    const failingClient = { importN8NChat: jest.fn(async () => {
      throw new Error('External agent target is blocked by egress policy.');
    }) };
    rerender(<ImportN8NChatCard client={failingClient} canImport />);
    fireEvent.click(screen.getByTestId('registry-n8n-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent('blocked by egress policy');
  });
});
