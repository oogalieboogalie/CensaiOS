export const PRODUCT_CAPABILITIES = Object.freeze([
  {
    id: 'persistent-family',
    label: 'persistent AI team',
    status: 'available',
    evidence: ['server/memory/core/agents.js', 'server/memory/prompt.js'],
  },
  {
    id: 'durable-memory',
    label: 'durable memory',
    status: 'available',
    evidence: ['server/memory/core/memory.js', 'server/memory/prompt.js'],
  },
  {
    id: 'family-messaging',
    label: 'agent messaging',
    status: 'available',
    evidence: ['server/agent-wakeups/runLifecycle.js'],
  },
  {
    id: 'scheduled-runs',
    label: 'scheduled runs',
    status: 'available',
    evidence: ['server/scheduler/coreRuns.js', 'server/runs/causality.js'],
  },
  {
    id: 'self-hosting',
    label: 'self-hostable stack',
    status: 'available',
    evidence: ['docker-compose.yml', 'Dockerfile'],
  },
  {
    id: 'free-ai-allowance',
    label: 'metered free AI requests',
    status: 'available',
    evidence: [
      'server/aiGateway/modelAccess.js',
      'server/aiGateway/freeTierAllowance.js',
      'src/components/chat/FreeAiAllowanceNotice.jsx',
      'scripts/verify-free-tier-upstream.mjs',
    ],
  },
  {
    id: 'project-prewarm',
    label: 'workspace-authorized project prewarm',
    status: 'available',
    evidence: [
      'server/workspaces/prewarm.js',
      'server/workspaces/projectMemberships.js',
      'src/lib/projectPrewarm.js',
    ],
  },
  {
    id: 'artisan-family-recipe',
    label: 'source-reviewed team identity setup',
    status: 'available',
    evidence: [
      'server/attributes/familyRecipes.js',
      'server/attributes/reviewedMindsetSources.js',
      'src/data/family-equipment-recipes.js',
    ],
  },
  {
    id: 'workspace-tool-modules',
    label: 'runtime-enforced, inspectable workspace tool modules',
    status: 'available',
    evidence: [
      'server/capabilities/workspaceCapabilities.js',
      'src/data/agent-capability-modules.js',
      'server/tools/rbac/checks.js',
      'server/tools/rbac/executionBoundary.js',
      'server/routes/agents/capabilities.js',
      'src/components/registry/ToolCatalogTab.jsx',
    ],
  },
  {
    id: 'action-approvals',
    label: 'durable agent action approvals',
    status: 'available',
    evidence: [
      'server/approvals/decisions.js',
      'server/routes/approvals.js',
      'src/components/PolicyDashboardWindow.jsx',
    ],
  },
  {
    id: 'durable-agent-card-installs',
    label: 'durable workspace AgentCard pins',
    status: 'available',
    evidence: [
      'server/agent-registry/installStore.js',
      'server/routes/agentRegistry/installs.js',
      'src/components/registry/useRegistryInstalls.js',
    ],
  },
]);

export const BETA_BOUNDARIES = Object.freeze([
  { id: 'mindsets', label: 'reviewed role-fit team setup; explicit workspace activation required', status: 'in-progress' },
  { id: 'external-cards', label: 'external AgentCard executors', status: 'planned' },
  { id: 'saas-tenancy', label: 'multi-tenant cloud isolation', status: 'planned' },
]);

export const LANDING_CAPABILITIES = Object.freeze(
  PRODUCT_CAPABILITIES.filter((capability) => capability.status === 'available').slice(0, 10)
);
