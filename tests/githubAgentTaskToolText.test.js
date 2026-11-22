// What the hand_coding_job_to_github tool tells an agent about itself must
// match what it does (server/github/agentTasks.js): which repositories are
// approved, what "done" means, and how to see where its jobs stand.
const { gitTools } = await import('../server/tools/definitions/git.js');

describe('hand_coding_job_to_github, as the agent reads it', () => {
  const tool = gitTools.find((item) => item.function.name === 'hand_coding_job_to_github').function;

  test('names every way a repository is approved, not "only two"', () => {
    expect(tool.description).toContain('a project you may work in on this board');
    expect(tool.description).toContain('CENSAI_AGENT_TASK_REPOS');
    expect(tool.description).not.toMatch(/only files in/i);
    expect(tool.parameters.properties.repo.description).not.toMatch(/Only /);
  });

  test('says merged alone is not done, and offers list_jobs', () => {
    expect(tool.description).toContain('Merged alone is not done');
    expect(tool.parameters.properties.list_jobs.type).toBe('boolean');
    // list_jobs is used alone, so nothing can be required by the schema; the handler asks for a title when filing.
    expect(tool.parameters.required).toEqual([]);
  });
});
