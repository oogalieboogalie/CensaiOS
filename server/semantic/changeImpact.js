import { CHANGE_IMPACT_RULES } from './changeImpactRegistry.js';

const ACTION_TERMS = [
  'add', 'build', 'change', 'create', 'edit', 'fix', 'implement', 'integrate',
  'make', 'move', 'refactor', 'remove', 'rename', 'replace', 'update', 'wire',
];

function normalized(value) {
  return String(value || '').toLowerCase().replace(/[_-]+/g, ' ');
}

function explicitPaths(text) {
  const matches = String(text || '').match(/(?:^|[\s"'`(])([.\w-]+(?:\/[.\w-]+)+\.[a-z0-9]+|[.\w-]+\/[.\w/-]+)/gi) || [];
  return [...new Set(matches.map(match => match.trim().replace(/^["'`(]/, '')))].slice(0, 8);
}

function matchesTerm(text, term) {
  return text.includes(normalized(term));
}

export function analyzeChangeImpact(request, context = {}) {
  const text = normalized(request);
  const action = ACTION_TERMS.find(term => matchesTerm(text, term));
  if (!action) return null;
  const anchors = explicitPaths(request);
  const coordination = {
    domain: 'change-coordination',
    label: 'Related change coordination',
    reason: `Detected change intent: ${action}`,
    risk: 'normal',
    surfaces: anchors.length ? anchors : [
      'direct target named or implied by the user',
      'imports, exports, callers, and downstream consumers',
      'registries, manifests, permissions, and configuration',
      'nearest tests and user-facing documentation',
    ],
    checks: [
      'inspect before editing',
      'identify every registration and consumer',
      'update tests and documentation that encode the old behavior',
      'leave a receipt for followed, rejected, and newly discovered relationships',
    ],
  };

  const matches = CHANGE_IMPACT_RULES
    .map(rule => ({
      rule,
      matchedTerms: rule.terms.filter(term => matchesTerm(text, term)),
    }))
    .filter(match => match.matchedTerms.length > 0)
    .sort((a, b) => b.matchedTerms.length - a.matchedTerms.length);

  const breadcrumbs = [coordination, ...matches.map(({ rule, matchedTerms }) => ({
    domain: rule.id,
    label: rule.label,
    reason: `Matched: ${matchedTerms.join(', ')}`,
    risk: rule.risk || 'normal',
    surfaces: [...new Set([...anchors, ...rule.surfaces])],
    checks: rule.checks,
  }))];

  return {
    version: 1,
    intent: action,
    request: String(request || '').trim(),
    project: context.project?.name || null,
    anchors,
    risk: breadcrumbs.some(item => item.risk === 'high') ? 'high' : 'normal',
    breadcrumbs,
  };
}

export function formatChangeImpactForPrompt(impact) {
  if (!impact?.breadcrumbs?.length) return '';
  const lines = [
    '## Semantic Change-Impact Breadcrumbs',
    'Treat this as an orientation checklist, not proof. Inspect the repository before editing and report any false match.',
  ];

  for (const item of impact.breadcrumbs) {
    lines.push('', `### ${item.label}${item.risk === 'high' ? ' [HIGH RISK]' : ''}`);
    lines.push(`Reason: ${item.reason}`);
    lines.push(`Related surfaces: ${item.surfaces.join(', ')}`);
    lines.push(`Verify: ${item.checks.join('; ')}`);
  }

  lines.push('', 'In the final response, leave a receipt naming which breadcrumbs were followed, rejected, or discovered during implementation.');
  return lines.join('\n');
}
