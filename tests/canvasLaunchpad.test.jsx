/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { EmptyState } from '../src/components/canvas/CanvasEmptyState.jsx';
import { LAUNCHPAD_STARTS } from '../src/components/canvas/CanvasLaunchpad.jsx';
import { LAUNCHER_MANIFESTS } from '../src/lib/windowManifest.js';

const starters = LAUNCHER_MANIFESTS
  .filter(manifest => manifest.launcher.startHere)
  .sort((a, b) => a.launcher.startHereOrder - b.launcher.startHereOrder);

// The launchpad's three still starting points, each backed by a manifest.
const tiles = LAUNCHPAD_STARTS
  .map((start) => LAUNCHER_MANIFESTS.find((m) => m.kind === start.kind));

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
  expect(screen.getByRole('heading', { name: 'Welcome to censaiOS.' })).toBeInTheDocument();

  // Theme-reactive logo wires to the tracked asset.
  expect(screen.getByRole('img', { name: 'censaiOS' })).toBeInTheDocument();

  // Exactly three still starting buttons, each shown once.
  const starts = screen.getByTestId('launchpad-starts');
  expect([...starts.querySelectorAll('button')].map((b) => b.textContent))
    .toEqual(['Chat with Censai', 'Find leads', 'Browse modules']);
  expect(starts.getAttribute('style') || '').not.toMatch(/animation|overflow/);

  // No promise of a tour unless a tour button is actually shown.
  expect(screen.queryByText(/take the tour/i)).not.toBeInTheDocument();

  // Mouse-hint block and footer hint text are present.
  expect(screen.getByText(/move through space/)).toBeInTheDocument();
  expect(screen.getByText(/Open a project from the top bar/)).toBeInTheDocument();

  // The old inline outcome form is gone from the launchpad by design.
  expect(screen.queryByPlaceholderText(/tell censai/i)).not.toBeInTheDocument();
});

test('tile click spawns its window kind', () => {
  const onSpawn = jest.fn();
  render(<EmptyState onSpawn={onSpawn} />);
  fireEvent.click(screen.getByText('Chat with Censai'));
  expect(onSpawn).toHaveBeenCalledTimes(1);
  expect(onSpawn.mock.calls[0][0]).toBe(tiles[0].kind);
});

test('every starting point is a real launcher window', () => {
  expect(tiles.every(Boolean)).toBe(true);
});

test('Find leads opens LeadHound', () => {
  const onSpawn = jest.fn();
  render(<EmptyState onSpawn={onSpawn} />);
  fireEvent.click(screen.getByText('Find leads'));
  expect(onSpawn.mock.calls[0][0]).toBe('leadHound');
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
