import { describe, expect, test } from '@jest/globals';
import { parseMarketplaceText, buildSystemAgentCardFromRow } from '../server/agent-registry/marketplaceText.js';

describe('marketplace text importer', () => {
  test('parses quoted multiline rows into structured records', () => {
    const sample = `Agent,Target Tool,Use Case,Technique,Prompt
The Prompt Architect,,Generate Prompts for AI,,"You are The Architect.\n\nDo the thing."
Idea Composer,,Take Idea Dump and Translate into articulateable text,,"Rewrite it."
`;

    const rows = parseMarketplaceText(sample);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      Agent: 'The Prompt Architect',
      'Target Tool': '',
      'Use Case': 'Generate Prompts for AI',
      Technique: '',
      Prompt: 'You are The Architect.\n\nDo the thing.',
    });
  });

  test('builds a system agent card payload from a marketplace row', () => {
    const row = {
      Agent: 'The Prompt Architect',
      'Target Tool': 'Gemini',
      'Use Case': 'Generate Prompts for AI',
      Technique: 'Prompt Engineering',
      Prompt: 'You are The Architect.',
    };

    const card = buildSystemAgentCardFromRow(row, 1);

    expect(card).toMatchObject({
      id: 'agent:the-prompt-architect',
      name: 'The Prompt Architect',
      visibility: 'public',
      owner_id: null,
      workspace_id: null,
    });
    expect(card.description).toContain('Generate Prompts for AI');
    expect(card.metadata.source).toBe('marketplace_text');
  });
});
