export const gitTools = [
  {
    type: 'function',
    function: {
      name: 'github_read_file',
      description: 'Read the contents of a file from a GitHub repository.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name in owner/repo format (e.g. "octocat/Hello-World")' },
          path: { type: 'string', description: 'Path to the file within the repository (e.g. "src/main.js")' },
        },
        required: ['repo', 'path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_write_file',
      description: 'Create or update a file in a GitHub repository on the default branch.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name in owner/repo format' },
          path: { type: 'string', description: 'Path to the file to create/update' },
          content: { type: 'string', description: 'The new contents of the file' },
          message: { type: 'string', description: 'Commit message' },
        },
        required: ['repo', 'path', 'content', 'message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_list_issues',
      description: 'List open issues for a GitHub repository.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name in owner/repo format' },
          state: { type: 'string', description: 'State of issues: open, closed, or all (defaults to open)' },
        },
        required: ['repo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_create_issue',
      description: 'Create a new issue in a GitHub repository.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name in owner/repo format' },
          title: { type: 'string', description: 'Issue title' },
          body: { type: 'string', description: 'Issue description/body' },
          assignees: { type: 'array', items: { type: 'string' }, description: 'List of GitHub usernames to assign' },
          labels: { type: 'array', items: { type: 'string' }, description: 'List of labels to apply (e.g., "jules", "bug")' },
        },
        required: ['repo', 'title', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_comment_issue',
      description: 'Add a comment to an existing GitHub issue.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name in owner/repo format' },
          issue_number: { type: 'integer', description: 'The issue number' },
          body: { type: 'string', description: 'Comment body text' },
        },
        required: ['repo', 'issue_number', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pr_status',
      description: 'Get the state of a GitHub PR: mergeable, draft, checks status, review state. Use before merging.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name (optional for sub-agents)' },
          pr_number: { type: 'integer', description: 'PR number' },
        },
        required: ['pr_number'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pr_comments',
      description: 'Read all reviews + comments on a PR, including bot reviews (e.g. Codex). Returns each comment with author and body. Use this to harvest review feedback you can feed back into a new Jules session.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name (optional for sub-agents)' },
          pr_number: { type: 'integer', description: 'PR number' },
        },
        required: ['pr_number'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'merge_pr',
      description: 'Merge a pull request. Default merge method is "squash". Will refuse if the PR is not mergeable. Reserved for head agents and worker sub-agents.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name (optional for sub-agents)' },
          pr_number: { type: 'integer', description: 'PR number' },
          method: { type: 'string', enum: ['merge', 'squash', 'rebase'], description: 'Merge method (default squash)' },
          commit_title: { type: 'string', description: 'Optional title for the merge commit' },
          commit_message: { type: 'string', description: 'Optional body for the merge commit' },
        },
        required: ['pr_number'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'local_git_status',
      description: 'Check local git status for a project after a task submission. Shows branch, dirty files, and recent commits without changing files.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Open local project name such as "CensaiHub".' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'local_git_fetch',
      description: 'Fetch remote refs for a local project after a task submission. This does not change local files.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Open local project name such as "CensaiHub".' },
          remote: { type: 'string', description: 'Remote name. Defaults to origin.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'local_git_pull_ff_only',
      description: 'Safely pull remote changes into a local project after a task submission. Refuses dirty worktrees and only allows fast-forward pulls.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Open local project name such as "CensaiHub".' },
          remote: { type: 'string', description: 'Remote name. Defaults to origin.' },
          branch: { type: 'string', description: 'Branch to pull. Defaults to the current branch upstream.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'local_git_checkpoint',
      description: 'Create a patch checkpoint of current local changes before pulling or verifying task-submission changes.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Open local project name such as "CensaiHub".' },
          label: { type: 'string', description: 'Short label for the checkpoint file.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'local_git_verify',
      description: 'Verify local task-submission changes by running build and/or tests in the local project.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Open local project name such as "CensaiHub".' },
          build: { type: 'boolean', description: 'Run npm run build. Defaults to true.' },
          tests: { type: 'boolean', description: 'Run npm test. Defaults to true.' },
          test_filter: { type: 'string', description: 'Optional test filter passed after npm test --.' },
        },
      },
    },
  },
];
