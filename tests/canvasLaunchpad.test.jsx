/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { EmptyState } from '../src/components/canvas/CanvasEmptyState.jsx';
import { LAUNCHER_MANIFESTS } from '../src/lib/windowManifest.js';

const starters = LAUNCHER_MANIFESTS
  .filter(manifest => manifest.launcher.startHere)
  .sort((a, b) => a.launcher.startHereOrder - b.launcher.startHereOrder);

// Same tile selection as CanvasLaunchpad: visible launcher entries, first 6.
const tiles = (LAUNCHER_MANIFESTS || [])
  .filter((m) => m?.launcher?.show)
  .slice(0, 6);

test('manifest owns exactly the four expected beta starting points', () => {
  // The manifest data (startHere entries) must stay stable regardless of
  // how the launchpad UI renders them.
  expect(starters.map(m => m.kind)).toEqual([
    'agentDesigner', 'groupChat', 'scheduler', 'marketplace',
  ]);
});

test('launchpad shows the CensaiOS welcome, module tiles, and mouse hints', () => {
  expect(tiles.length).toBeGreaterThan(0);
  render(<EmptyState onSpawn={jest.fn()} />);

  // The launchpad container must be present.
  expect(screen.getByTestId('canvas-launchpad')).toBeInTheDocument();

  // Heading is always shown.
  expect(screen.getByRole('heading', { name: 'Welcome to CensaiOS.' })).toBeInTheDocument();

  // Theme-reactive logo wires to the tracked asset.
  expect(screen.getByAltText('CensaiOS').getAttribute('src')).toContain('trimmedblk.png');

  // Module tiles render (marquee duplicates the row, so match loosely).
  const hint = tiles[0].launcher.hint || tiles[0].launcher.label;
  expect(screen.getAllByTitle(hint).length).toBeGreaterThanOrEqual(1);

  // Mouse-hint block and footer hint text are present.
  expect(screen.getByText(/move through space/)).toBeInTheDocument();
  expect(screen.getByText(/Open a project from the top bar/)).toBeInTheDocument();

  // The old inline outcome form is gone from the launchpad by design.
  expect(screen.queryByPlaceholderText(/tell censai/i)).not.toBeInTheDocument();
});

test('tile click spawns its window kind', () => {
  const onSpawn = jest.fn();
  render(<EmptyState onSpawn={onSpawn} />);
  const hint = tiles[0].launcher.hint || tiles[0].launcher.label;
  fireEvent.click(screen.getAllByTitle(hint)[0]);
  expect(onSpawn).toHaveBeenCalledTimes(1);
  expect(onSpawn.mock.calls[0][0]).toBe(tiles[0].kind);
});

test('tour button stays hidden without a tour handler', () => {
  render(<EmptyState onSpawn={jest.fn()} />);
  expect(screen.queryByText(/Show me around/)).not.toBeInTheDocument();
});

test('tour button calls the provided tour handler', () => {
  const onTour = jest.fn();
  render(<EmptyState onSpawn={jest.fn()} onTour={onTour} />);
  fireEvent.click(screen.getByText(/Show me around/));
  expect(onTour).toHaveBeenCalledTimes(1);
});
