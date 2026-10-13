// Pure OSV version matching, following the OSV schema's range evaluation
// (https://ossf.github.io/osv-schema/#evaluation). No I/O.
import semver from 'semver';

// OSV ecosystem names are case-sensitive; callers and config use lowercase.
const ECOSYSTEM_NAMES = {
  npm: 'npm', pypi: 'PyPI', go: 'Go', maven: 'Maven', nuget: 'NuGet',
  'crates.io': 'crates.io', rubygems: 'RubyGems', packagist: 'Packagist',
};

export function osvEcosystem(name) {
  const key = String(name || '').trim();
  return ECOSYSTEM_NAMES[key.toLowerCase()] || key;
}

function semverOf(value) {
  if (value === '0') return '0.0.0-0';
  return semver.valid(value, { loose: true }) || semver.valid(semver.coerce(value, { includePrerelease: true }));
}

function eventVersion(event) {
  return event.introduced ?? event.fixed ?? event.last_affected ?? event.limit;
}

// Returns true/false when the range can be evaluated, null when it cannot
// (e.g. GIT commit ranges or unparseable versions).
export function versionInRange(version, range) {
  if (!range || (range.type !== 'SEMVER' && range.type !== 'ECOSYSTEM')) return null;
  const target = semverOf(version);
  if (!target) return null;
  const events = [];
  for (const event of range.events || []) {
    const parsed = semverOf(eventVersion(event));
    if (!parsed) return null;
    events.push({ event, parsed });
  }
  events.sort((a, b) => semver.compare(a.parsed, b.parsed));
  let affected = false;
  for (const { event, parsed } of events) {
    if (event.introduced !== undefined && semver.gte(target, parsed)) affected = true;
    else if (event.fixed !== undefined && semver.gte(target, parsed)) affected = false;
    else if (event.last_affected !== undefined && semver.gt(target, parsed)) affected = false;
    else if (event.limit !== undefined && semver.gte(target, parsed)) affected = false;
  }
  return affected;
}

export function affectsVersion(vuln, { ecosystem, name, version }) {
  if (!vuln || vuln.withdrawn) return false;
  const eco = osvEcosystem(ecosystem);
  for (const affected of vuln.affected || []) {
    const pkg = affected.package || {};
    if (pkg.ecosystem !== eco || pkg.name !== name) continue;
    if ((affected.versions || []).includes(version)) return true;
    // npm/semver ecosystems are evaluated by range; others rely on the
    // explicit `versions` list that OSV enumerates for them.
    for (const range of affected.ranges || []) {
      if (eco !== 'npm' && range.type !== 'SEMVER') continue;
      if (versionInRange(version, range) === true) return true;
    }
  }
  return false;
}

// (ecosystem, package) pairs a record should be indexed under.
export function affectedPackages(vuln) {
  const seen = new Map();
  for (const affected of vuln?.affected || []) {
    const { ecosystem, name } = affected.package || {};
    if (!ecosystem || !name) continue;
    // Strip ecosystem suffixes like "Debian:12" down to the base ecosystem.
    const base = String(ecosystem).split(':')[0];
    seen.set(`${base}\u0000${name}`, { ecosystem: base, name });
  }
  return [...seen.values()];
}
