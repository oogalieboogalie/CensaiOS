/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import { RegionMenu } from '../src/components/canvas/CanvasRegionMenu.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

describe('Sidebar Favorites Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset/clear workspace store state before each test
    act(() => {
      useWorkspaceStore.getState().setSidebarFavorites([]);
    });
  });

  const minimalProps = {
    rect: { x: 100, y: 100, w: 200, h: 200 },
    zoom: 1,
    neighbor: null,
    onFitNeighbor: jest.fn(),
    onCancel: jest.fn(),
    onPickIdea: jest.fn(),
    onPickPlan: jest.fn(),
    onPickGroup: jest.fn(),
    onPickChat: jest.fn(),
    onPickGroupChat: jest.fn(),
    onPickWorkflow: jest.fn(),
    onPickCodeEditor: jest.fn(),
    onPickHtmlPreview: jest.fn(),
    onPickAgent: jest.fn(),
    onPickImage: jest.fn(),
    onPickBrowser: jest.fn(),
    onPickFiles: jest.fn(),
    onPickCalendar: jest.fn(),
    onPickScheduler: jest.fn(),
    onPickOperations: jest.fn(),
    onPickMusic: jest.fn(),
    onPickStream: jest.fn(),
    onPickExoSkeleton: jest.fn(),
    onPickOverseer: jest.fn(),
    onShare: jest.fn(),
    onDownload: jest.fn(),
  };

  test('starts with empty favorites and shows only Customize + actions', () => {
    render(React.createElement(RegionMenu, minimalProps));

    // There should be: 1 Customize button, 1 Share button, 1 Save Image button = 3 buttons
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
  });

  test('opens Customize popover and displays list of modules', () => {
    render(React.createElement(RegionMenu, minimalProps));

    const buttons = screen.getAllByRole('button');
    const customizeButton = buttons[0];

    // Click Customize button
    fireEvent.click(customizeButton);

    // Sidebar Favorites header should be visible
    expect(screen.getByText('Sidebar Favorites')).toBeInTheDocument();

    // Check that various modules are listed
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('Idea Pad')).toBeInTheDocument();
    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByText('Files')).toBeInTheDocument();
  });

  test('toggles favorite module, updating rail and store', () => {
    render(React.createElement(RegionMenu, minimalProps));

    // Click customize button to open popover
    fireEvent.click(screen.getAllByRole('button')[0]);

    // Click "Plan" in the customize popover to favorite it
    const planToggle = screen.getByText('Plan').closest('button');
    fireEvent.click(planToggle);

    // Verify it was added to the store
    expect(useWorkspaceStore.getState().sidebarFavorites).toContain('plan');

    // Close customize popover (click customize again)
    fireEvent.click(screen.getAllByRole('button')[0]);

    // Now the rail should have 4 buttons (Customize, Plan, Share, Save Image)
    const newButtons = screen.getAllByRole('button');
    expect(newButtons).toHaveLength(4);
  });

  test('favorited module still runs its original action', () => {
    render(React.createElement(RegionMenu, minimalProps));

    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.click(screen.getByText('Plan').closest('button'));
    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.click(screen.getAllByRole('button')[1]);

    expect(minimalProps.onPickPlan).toHaveBeenCalledTimes(1);
  });

  test('removes module from favorites when clicked again', () => {
    render(React.createElement(RegionMenu, minimalProps));

    // Open customize popover
    fireEvent.click(screen.getAllByRole('button')[0]);

    // Click "Plan" to add
    fireEvent.click(screen.getByText('Plan').closest('button'));
    expect(useWorkspaceStore.getState().sidebarFavorites).toContain('plan');

    // Click "Plan" again to remove
    fireEvent.click(screen.getByText('Plan').closest('button'));
    expect(useWorkspaceStore.getState().sidebarFavorites).not.toContain('plan');

    // Close customize popover
    fireEvent.click(screen.getAllByRole('button')[0]);

    // Rail should be back to 3 buttons
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
});
