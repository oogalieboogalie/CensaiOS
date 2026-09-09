export function ChangeImpactBreadcrumbs({ impact }) {
  if (!impact?.breadcrumbs?.length) return null;

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)' }}>
        change-impact breadcrumbs · {impact.risk} risk
      </div>
      {impact.breadcrumbs.map(item => (
        <div key={item.domain} style={{ border: '1px solid var(--hairline)', borderRadius: 8, background: 'var(--surface)', padding: '7px 8px', display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ color: 'var(--accent-ink)', fontSize: 11 }}>{item.label}</strong>
            {item.risk === 'high' && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ps-red)' }}>high risk</span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-soft)', overflowWrap: 'anywhere' }}>
            {item.surfaces.join(' · ')}
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-faint)' }}>
            Verify: {item.checks.join('; ')}
          </div>
        </div>
      ))}
    </div>
  );
}
