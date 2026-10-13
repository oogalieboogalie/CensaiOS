import fs from 'node:fs';
import {
  filterReviewedMindsets,
  isReviewedMindsetDefinition,
  REVIEWED_MINDSET_IDS,
  REVIEWED_MINDSET_SOURCES,
  reviewedMindsetIssueCount,
} from '../server/attributes/reviewedMindsetSources.js';

function reviewedRow(id) {
  const source = REVIEWED_MINDSET_SOURCES[id];
  return {
    id,
    type: 'mindset',
    validation: {
      source: source.source,
      source_family: source.sourceFamily,
      report: source.report,
      issues: source.issues.map(([number]) => number),
    },
  };
}

describe('reviewed Idea Foundry mindset source contract', () => {
  test('pins six definitions to 30 unique issues and the checked-in seed', () => {
    const issueNumbers = Object.values(REVIEWED_MINDSET_SOURCES)
      .flatMap(source => source.issues.map(([number]) => number));
    const seed = fs.readFileSync('docker/029-seed-mindsets.sql', 'utf8');

    expect(REVIEWED_MINDSET_IDS).toHaveLength(6);
    expect(reviewedMindsetIssueCount()).toBe(30);
    expect(new Set(issueNumbers).size).toBe(30);
    for (const [id, source] of Object.entries(REVIEWED_MINDSET_SOURCES)) {
      expect(seed).toContain(`'${id}'`);
      expect(seed).toContain(JSON.stringify(source.issues.map(([number]) => number)));
      expect(source.issues.every(([, title, hash]) => title && /^[a-f0-9]{64}$/.test(hash))).toBe(true);
    }
  });

  test('accepts only the exact ID, family, report, and ordered issue set', () => {
    const exact = reviewedRow('mindset_strategic_foresight');
    const fake = {
      id: exact.id,
      type: 'mindset',
      validation: { issues: [999], report: exact.validation.report },
    };
    const copied = { ...exact, id: 'raw-copy' };

    expect(isReviewedMindsetDefinition(exact)).toBe(true);
    expect(isReviewedMindsetDefinition(fake)).toBe(false);
    expect(isReviewedMindsetDefinition(copied)).toBe(false);
    expect(filterReviewedMindsets([fake, exact, copied])).toEqual([exact]);
  });
});
