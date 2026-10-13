import { fetchChatCompletion } from '../routes/chat/shared.js';

/**
 * Score and prioritize artifacts based on importance and relevance.
 * This is a lightweight classification helper.
 */
export async function prioritizeArtifacts(artifacts, context = {}) {
  if (!artifacts || artifacts.length === 0) return [];

  // If context is minimal, just return sorted by created_at
  if (!context.query && !context.activeGoal) {
    return artifacts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  try {
    const prompt = `
You are a prioritization engine for a collaboration workspace.
Context: ${JSON.stringify(context)}

Artifacts to rank:
${artifacts.map((a, i) => `${i}. [${a.artifact_type}] ${a.title}: ${JSON.stringify(a.data)}`).join('\n')}

Rank these artifacts from 0 (noise) to 1 (highly relevant/urgent) based on the context.
Return a JSON array of scores corresponding to the input order.
Example: [0.9, 0.1, 0.5]
`;

    const response = await fetchChatCompletion({
      messages: [{ role: 'system', content: prompt }],
      temperature: 0,
      model: 'minimax-m2.5:cloud'
    });

    const scores = JSON.parse(response.choices[0].message.content.match(/\[.*\]/s)[0]);

    return artifacts
      .map((a, i) => ({ ...a, priorityScore: scores[i] || 0 }))
      .sort((a, b) => b.priorityScore - a.priorityScore);
  } catch (err) {
    console.error('Prioritization error:', err);
    // Fallback to time-based sorting
    return artifacts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
}
