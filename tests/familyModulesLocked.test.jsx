/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FamilyModulesLocked } from '../src/components/exoskeleton/FamilyModulesLocked.jsx';

test('requires a workspace before offering scoped module controls', () => {
  render(FamilyModulesLocked({
    agent: { id: 'atlas', name: 'Atlas', glyph: 'A', hue: 220 },
  }));

  expect(screen.getByText('Open a workspace to equip modules')).toBeInTheDocument();
  expect(screen.getByText(/Tool modules are additive and belong to one workspace/)).toBeInTheDocument();
  expect(screen.getByText(/Global role tools remain policy-managed/)).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('keeps controls locked while a workspace selection is loading', () => {
  render(FamilyModulesLocked({
    agent: { id: 'atlas', name: 'Atlas', glyph: 'A', hue: 220 },
    loading: true,
  }));

  expect(screen.getByText('Loading workspace modules')).toBeInTheDocument();
  expect(screen.getByText(/stays locked until this workspace's saved module selection is loaded/)).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
