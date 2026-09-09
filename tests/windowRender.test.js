/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, act, screen, fireEvent, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { WINDOW_MANIFESTS, buildWindowLabObject } from '../src/lib/windowManifest.js';

describe('Window Render Smoke Tests', () => {
  beforeAll(async () => {
    // We cannot use standard jest.mock because of VM modules setup.
    // Instead we rely on the same api stubbing that other integration tests use.
    // However, since we're just rendering components, we provide a global catch-all.
    // But since the components import api, we can't easily intercept it at the module level
    // without unstable_mockModule which behaves inconsistently in our current version.
    // Given the constraints and prior failure, we use the original approach that WORKED
    // during the acceptance phase: dynamically importing with unstable_mockModule.

    // Mock ResizeObserver which isn't present in jsdom
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    // Mock scrollIntoView
    window.HTMLElement.prototype.scrollIntoView = jest.fn();

    // Mock fetch
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('')
    }));

    // Mock WebSocket
    class MockWebSocket {
      constructor() {
        this.readyState = 1;
        this.onopen = null;
        this.onmessage = null;
        this.onclose = null;
        this.onerror = null;
        this.send = jest.fn();
        this.close = jest.fn();
      }
      addEventListener(event, callback) {
        if (event === 'open') this.onopen = callback;
        if (event === 'message') this.onmessage = callback;
        if (event === 'close') this.onclose = callback;
        if (event === 'error') this.onerror = callback;
      }
      removeEventListener(event, callback) {
        if (event === 'open' && this.onopen === callback) this.onopen = null;
        if (event === 'message' && this.onmessage === callback) this.onmessage = null;
        if (event === 'close' && this.onclose === callback) this.onclose = null;
        if (event === 'error' && this.onerror === callback) this.onerror = null;
      }
    }
    global.WebSocket = MockWebSocket;
  });

  const windows = WINDOW_MANIFESTS.map(manifest => [manifest.kind, manifest]);

  test.each(windows)('renders window kind: %s', async (kind, manifest) => {
    // If the component is a provider connect window, mock api requests within the test using global fetch intercept
    // since the component fetches directly. For others, rely on the global fallbacks.

    // We import dynamically to avoid pulling the real 'api.js' module too early
    let mod;
    try {
      mod = await import(`../${manifest.componentPath}`);
    } catch (err) {
      throw new Error(`Failed to import module at '../${manifest.componentPath}': ${err.message}`);
    }

    const Component = mod[manifest.componentName];
    if (!Component) {
      throw new Error(`Component for window kind '${kind}' is undefined. Check if it is correctly imported/registered.`);
    }

    // Build the props with lab object config
    const win = buildWindowLabObject(kind);

    // Attempt to render the component. If it throws, the test will fail loudly.
    let container;
    await act(async () => {
      const result = render(
        React.createElement(Component, {
          win: win,
          onUpdate: () => {}
        })
      );
      container = result.container;
    });

    // Verify it produced output (i.e., did not return null/empty fragment without throwing)
    expect(container).not.toBeEmptyDOMElement();
  });

  test('operations board names its missing workspace scope', async () => {
    const { OperationsBoardWindow } = await import('../src/components/OperationsBoardWindow.jsx');

    await act(async () => {
      render(React.createElement(OperationsBoardWindow, {
        win: { id: 'operations-scope-test', title: 'Live Operations' },
        onUpdate: () => {},
        isActive: false,
      }));
    });

    expect(screen.getByText(/open a workspace to scope schedules and agent tasks/i)).toBeInTheDocument();
    expect(screen.getByText(/workspace schedules and agent tasks are unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/no delegated agent tasks/i)).not.toBeInTheDocument();
  });

  test('agent registry names its missing workspace scope', async () => {
    const { RegistryWindow } = await import('../src/components/RegistryWindow.jsx');
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ items: [{ id: 'agent:architect', name: 'Architect', visibility: 'public', skills: [] }] }),
      text: () => Promise.resolve(''),
    });

    await act(async () => {
      render(React.createElement(RegistryWindow, {
        win: { id: 'registry-scope-test', title: 'Agent Registry' },
        onUpdate: () => {},
      }));
    });

    expect(screen.getByText(/open a workspace to pin, publish, or call agentcards/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId('registry-install').length).toBeGreaterThan(0));
    expect(screen.getAllByTestId('registry-install')[0]).toBeDisabled();
    fireEvent.click(screen.getByTestId('registry-tab-publish'));
    expect(screen.getByTestId('registry-publish-submit')).toBeDisabled();
  });
});
