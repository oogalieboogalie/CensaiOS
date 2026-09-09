import { configurationWorkspaceQuery, readConfigurationResponse } from './agentConfiguration.js';

export async function getFamilyEquipmentRecipes(workspaceId) {
  const scope = configurationWorkspaceQuery(workspaceId);
  return readConfigurationResponse(
    await fetch(`/api/family/equipment-recipes?${scope}`),
    'Team setups could not be loaded.',
  );
}

export async function applyFamilyEquipmentRecipe(recipeId, expectedHash, workspaceId) {
  return readConfigurationResponse(await fetch(
    `/api/family/equipment-recipes/${encodeURIComponent(recipeId)}/apply`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, expectedHash, confirmReplace: true }),
    },
  ), 'The team setup was not applied.');
}
