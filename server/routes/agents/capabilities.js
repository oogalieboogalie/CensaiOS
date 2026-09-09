import express from 'express';
import pool from '../../db.js';
import { filterToolsForAgent } from '../../tools.js';
import {
  listWorkspaceCapabilityModules,
  loadWorkspaceCapabilityToolNames,
  replaceWorkspaceCapabilityModules,
} from '../../capabilities/workspaceCapabilities.js';
import { requireDb } from './shared.js';
import { resolveConfigurationScope } from './configurationScope.js';
import { sendConfigurationError } from './configurationErrors.js';
import { buildFamilyToolRegistry } from '../../tools/familyRegistry.js';
import { loadInstalledToolPackageModuleIds } from '../../capabilities/packageStore.js';

export const capabilitiesRouter = express.Router();

capabilitiesRouter.get('/agents/:id/capabilities', requireDb, async (req, res) => {
  try {
    const scope = await resolveConfigurationScope(req);
    const capabilities = await listWorkspaceCapabilityModules(pool, scope);
    const installedModuleIds = await loadInstalledToolPackageModuleIds(pool, scope.workspaceId);
    res.json({
      capabilities,
      modules: capabilities.map(row => row.module_id),
      installedModuleIds,
      workspaceId: scope.workspaceId,
    });
  } catch (error) {
    sendConfigurationError(res, error, 'Agent modules are temporarily unavailable.');
  }
});

capabilitiesRouter.put('/agents/:id/capabilities', requireDb, async (req, res) => {
  try {
    const scope = await resolveConfigurationScope(req, { write: true });
    const result = await replaceWorkspaceCapabilityModules(pool, {
      ...scope,
      moduleIds: req.body?.modules,
    });
    res.json({ ok: true, workspaceId: scope.workspaceId, ...result });
  } catch (error) {
    sendConfigurationError(res, error, 'The module selection was not saved.');
  }
});

capabilitiesRouter.get('/agents/:id/debug-tools', requireDb, async (req, res) => {
  try {
    const scope = await resolveConfigurationScope(req);
    const [tools, moduleTools] = await Promise.all([
      filterToolsForAgent(scope.agentId, scope),
      loadWorkspaceCapabilityToolNames(pool, scope),
    ]);
    res.json({
      tools: tools.map(tool => tool.function.name),
      moduleTools,
      workspaceId: scope.workspaceId,
    });
  } catch (error) {
    sendConfigurationError(res, error, 'Agent tools are temporarily unavailable.');
  }
});

capabilitiesRouter.get('/agents/:id/tool-registry', requireDb, async (req, res) => {
  try {
    const scope = await resolveConfigurationScope(req);
    const [tools, capabilities, installedModuleIds] = await Promise.all([
      filterToolsForAgent(scope.agentId, scope),
      listWorkspaceCapabilityModules(pool, scope),
      loadInstalledToolPackageModuleIds(pool, scope.workspaceId),
    ]);
    res.json({
      ...buildFamilyToolRegistry({
        agentId: scope.agentId, effectiveTools: tools, capabilities, installedModuleIds,
      }),
      agentId: scope.agentId,
      workspaceId: scope.workspaceId,
      canManage: ['owner', 'admin'].includes(scope.role),
    });
  } catch (error) {
    sendConfigurationError(res, error, 'The effective tool registry is temporarily unavailable.');
  }
});
