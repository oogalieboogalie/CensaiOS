// Reads and writes CHANGELOG.md for the public censaiOS releases.
//
// The file is a short intro, then at most one "Unreleased" section (what the
// nightly builds have that no stable release has yet), then one section per
// stable release, newest first:
//
//   ## Unreleased: in the nightly builds, not in a stable release yet
//   ## 0.4.0 (2026-10-25)
//
// The release automation rewrites it every night and every Sunday.

export const UNRELEASED_HEADING = '## Unreleased: in the nightly builds, not in a stable release yet';

const RELEASE_HEADING = /^## (\d+\.\d+\.\d+)\b/;

/** Splits the file into its intro and its "## " sections. */
export function parseChangelog(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const intro = [];
  const sections = [];
  for (const line of lines) {
    if (line.startsWith('## ')) {
      const version = RELEASE_HEADING.exec(line)?.[1] || null;
      sections.push({ heading: line, version, unreleased: /^## Unreleased\b/i.test(line), body: [] });
    } else if (sections.length) {
      sections[sections.length - 1].body.push(line);
    } else {
      intro.push(line);
    }
  }
  return {
    intro: intro.join('\n').trim(),
    sections: sections.map((s) => ({ ...s, body: s.body.join('\n').trim() })),
  };
}

function render({ intro, sections }) {
  const parts = [intro, ...sections.map((s) => (s.body ? `${s.heading}\n\n${s.body}` : s.heading))];
  return `${parts.filter(Boolean).join('\n\n')}\n`;
}

/** The body of one section: a version such as "0.4.0", or "unreleased". */
export function readSection(md, which) {
  const { sections } = parseChangelog(md);
  const found = sections.find((s) => (which === 'unreleased' ? s.unreleased : s.version === which));
  return found ? found.body : null;
}

/** Puts `body` in the Unreleased section (first, above every release); null removes it. */
export function withUnreleased(md, body) {
  const parsed = parseChangelog(md);
  const sections = parsed.sections.filter((s) => !s.unreleased);
  if (body) sections.unshift({ heading: UNRELEASED_HEADING, unreleased: true, version: null, body: body.trim() });
  return render({ ...parsed, sections });
}

/** Adds (or replaces) a stable release section on top and drops the Unreleased one. */
export function withRelease(md, version, date, body) {
  const parsed = parseChangelog(md);
  const sections = parsed.sections.filter((s) => !s.unreleased && s.version !== version);
  sections.unshift({ heading: `## ${version} (${date})`, unreleased: false, version, body: String(body || '').trim() });
  return render({ ...parsed, sections });
}
