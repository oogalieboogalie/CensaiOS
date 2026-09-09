import { AGENT_CAPABILITY_MODULES } from '../../src/data/agent-capability-modules.js';
import { listToolCatalog } from './catalog.js';
import {
  FAMILY_INTRINSIC_TOOL_POLICIES,
  familyDefaultToolNames,
  familyToolPolicy,
} from './rbac/familyBaseline.js';
import { getToolPackageForModule } from '../capabilities/packageCatalog.js';

const INTRINSIC_NAMES = new Set(FAMILY_INTRINSIC_TOOL_POLICIES.map(entry => entry.name));

function moduleByToolName() {
  const result = new Map();
  for (const module of AGENT_CAPABILITY_MODULES) {
    for (const toolName of module.toolNames) {
      if (result.has(toolName)) throw new Error(`Tool ${toolName} belongs to more than one family module.`);
      result.set(toolName, module);
    }
  }
  return result;
}

export function buildFamilyToolRegistry({
  agentId, effectiveTools = [], capabilities = [], installedModuleIds = [],
}) {
  const catalog = new Map(listToolCatalog().tools.map(tool => [tool.name, tool]));
  const moduleByTool = moduleByToolName();
  const activeNames = new Set(effectiveTools.map(tool => (
    typeof tool === 'string' ? tool : tool.function?.name
  )).filter(Boolean));
  const equippedIds = new Set(capabilities.map(row => row.module_id));
  const installedIds = new Set(installedModuleIds);
  const candidateNames = new Set([
    ...familyDefaultToolNames(agentId),
    ...AGENT_CAPABILITY_MODULES.flatMap(module => module.toolNames),
  ]);

  const tools = [...candidateNames].map(name => {
    const metadata = catalog.get(name);
    if (!metadata) throw new Error(`Family tool ${name} is missing from the runtime catalog.`);
    const module = moduleByTool.get(name) || null;
    const defaultPolicy = familyToolPolicy(agentId, name);
    const equipped = Boolean(module && equippedIds.has(module.id));
    const packageInstalled = Boolean(module && installedIds.has(module.id));
    const status = activeNames.has(name) ? 'active'
      : module && !packageInstalled ? 'install_required' : 'attachable';
    return {
      name,
      label: metadata.label,
      description: metadata.description,
      category: metadata.category,
      kit: metadata.kit,
      scopeKind: metadata.scopeKind,
      provider: metadata.provider,
      risk: module?.risk || defaultPolicy?.risk || metadata.risk,
      mode: module?.mode || defaultPolicy?.mode || 'autonomous',
      source: defaultPolicy ? (INTRINSIC_NAMES.has(name) ? 'intrinsic' : 'role') : 'module',
      status,
      equipped,
      module: module ? {
        id: module.id,
        name: module.name,
        slot: module.slot,
        package: getToolPackageForModule(module.id)?.id || null,
        packageInstalled,
      } : null,
      approvalRequired: module?.mode === 'execute_with_approval',
    };
  }).sort((a, b) => (
    Number(b.status === 'active') - Number(a.status === 'active')
    || a.category.localeCompare(b.category)
    || a.label.localeCompare(b.label)
  ));

  const modules = AGENT_CAPABILITY_MODULES.map(module => ({
    packageId: getToolPackageForModule(module.id)?.id || null,
    id: module.id,
    name: module.name,
    slot: module.slot,
    risk: module.risk,
    mode: module.mode,
    equipped: equippedIds.has(module.id),
    installed: installedIds.has(module.id),
    toolCount: module.toolNames.length,
  }));

  return {
    tools,
    modules,
    counts: {
      active: tools.filter(tool => tool.status === 'active').length,
      attachable: tools.filter(tool => tool.status === 'attachable').length,
      installRequired: tools.filter(tool => tool.status === 'install_required').length,
      equippedModules: modules.filter(module => module.equipped).length,
      installedPackages: modules.filter(module => module.installed).length,
    },
  };
}
