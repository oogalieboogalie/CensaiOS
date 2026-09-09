export const depTools = [
  {
    type: 'function',
    function: {
      name: 'vulnerability_audit',
      description: 'Run a security audit on a project or a specific file. Checks for vulnerable dependencies and security hotspots.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name or project tool reference.' },
          dependencies: { type: 'object', description: 'Optional map of package names to versions.' },
          ecosystem: { type: 'string', description: 'Dependency ecosystem (default: npm).' },
          file_path: { type: 'string', description: 'Path to the file or package.json to audit.' },
          repo_root: { type: 'string', description: 'Optional: repository root path.' },
        },
      },
    },
  },
];
