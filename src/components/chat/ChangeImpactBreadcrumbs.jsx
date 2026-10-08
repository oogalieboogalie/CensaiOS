export function ChangeImpactBreadcrumbs({ impact }) {
  if (!impact?.breadcrumbs?.length) return null;

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>
        change-impact breadcrumbs · {impact.risk} risk
      </div>
      {impact.breadcrumbs.map(item => (
        <div key={item.domain} style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', background: 'var(--surface)', padding: '7px 8px', display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ color: 'var(--accent-ink)', fontSize: 'var(--text-xs)' }}>{item.label}</strong>
            {item.risk === 'high' && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ps-red)' }}>high risk</span>
            )}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', overflowWrap: 'anywhere' }}>
            {item.surfaces.join(' · ')}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>
            Verify: {item.checks.join('; ')}
          </div>
        </div>
      ))}
    </div>
  );
}
