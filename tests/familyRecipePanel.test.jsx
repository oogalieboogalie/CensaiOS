/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FAMILY_AGENT_BY_ID } from '../src/data/family-agents.js';
import { FAMILY_EQUIPMENT_RECIPES } from '../src/data/family-equipment-recipes.js';

const getFamilyEquipmentRecipes = jest.fn();
const applyFamilyEquipmentRecipe = jest.fn();
jest.unstable_mockModule('../src/lib/api.js', () => ({
  api: { getFamilyEquipmentRecipes, applyFamilyEquipmentRecipe },
}));

const { FamilyRecipePanel } = await import('../src/components/exoskeleton/FamilyRecipePanel.jsx');
const { useWorkspaceStore } = await import('../src/lib/store.js');
const originalState = useWorkspaceStore.getState();
const base = FAMILY_EQUIPMENT_RECIPES[0];
const recipe = {
  ...base,
  hash: 'recipe-hash',
  applied: false,
  differenceCount: 33,
  agents: Object.fromEntries(Object.entries(base.agents).map(([id, loadout]) => [id, {
    ...loadout,
    name: FAMILY_AGENT_BY_ID[id].name,
    role: FAMILY_AGENT_BY_ID[id].role,
  }])),
};

beforeEach(() => {
  jest.clearAllMocks();
  act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-active' }));
  getFamilyEquipmentRecipes.mockResolvedValue({ recipes: [recipe] });
  applyFamilyEquipmentRecipe.mockResolvedValue({ recipe: { ...recipe, applied: true, differenceCount: 0 } });
});

afterAll(() => {
  act(() => useWorkspaceStore.setState(originalState));
});

describe('Artisan family recipe panel', () => {
  test('shows replacement scope, reveals all eight loadouts, and applies only after review', async () => {
    const onApplied = jest.fn();
    render(<FamilyRecipePanel allAttributes={[]} allMindsets={[]} onApplied={onApplied} />);

    expect(await screen.findByText('Artisan Team v1')).toBeInTheDocument();
    expect(getFamilyEquipmentRecipes).toHaveBeenCalledWith('workspace-active');
    expect(screen.getByText(/replaces the current attributes and mindsets for all eight/i)).toBeInTheDocument();
    expect(applyFamilyEquipmentRecipe).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Review all eight loadouts' }));
    for (const agent of Object.values(FAMILY_AGENT_BY_ID)) {
      expect(screen.getByText(agent.name)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Apply to all eight agents' }));

    await waitFor(() => expect(applyFamilyEquipmentRecipe).toHaveBeenCalledWith(
      'artisan-family-v1', 'recipe-hash', 'workspace-active',
    ));
    expect(onApplied).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Applied to this workspace' })).toBeDisabled();
  });

  test('does not request without a workspace or render a stale workspace response', async () => {
    act(() => useWorkspaceStore.setState({ workspaceId: null }));
    const { rerender } = render(<FamilyRecipePanel allAttributes={[]} allMindsets={[]} />);
    await waitFor(() => expect(getFamilyEquipmentRecipes).not.toHaveBeenCalled());

    let resolveOld;
    getFamilyEquipmentRecipes.mockImplementation(workspaceId => (
      workspaceId === 'workspace-old'
        ? new Promise(resolve => { resolveOld = resolve; })
        : Promise.resolve({ recipes: [] })
    ));
    act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-old' }));
    rerender(<FamilyRecipePanel allAttributes={[]} allMindsets={[]} />);
    await waitFor(() => expect(resolveOld).toBeDefined());
    act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-new' }));
    await act(async () => resolveOld({ recipes: [recipe] }));

    expect(screen.queryByText('Artisan Team v1')).not.toBeInTheDocument();
    expect(getFamilyEquipmentRecipes).toHaveBeenCalledWith('workspace-new');
  });
});
