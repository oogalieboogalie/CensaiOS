import { truncate, readPackageJson, formatResult, runCommand, resolveLocalBin, resolveRunnerContext, resolveLinterContext } from './runnerUtils.js';

export async function handleRunnerTool(agentId, name, args, context = {}) {
  switch (name) {
    case 'run_tests': {
      const timeoutMs = args.timeout_ms || 30000;
      const { cwd } = await resolveRunnerContext(agentId, args, context);
      const pkgJson = await readPackageJson(cwd);
      if (!pkgJson) return 'Could not read package.json — unable to detect test runner.';
      const hasTestScript = pkgJson.scripts?.test && !pkgJson.scripts.test.includes('no test specified');
      if (!hasTestScript) return 'No test script found in package.json. Add a "test" script to enable this tool.';
      const npmArgs = ['test'];
      if (args.filter) npmArgs.push('--', args.filter);
      try {
        const { stdout, stderr } = await runCommand('npm', npmArgs, { cwd, timeout: timeoutMs });
        return formatResult('TEST RUN — SUCCESS', 0, truncate(stdout), truncate(stderr));
      } catch (err) {
        if (err.code === 'ETIMEDOUT') return `run_tests timed out after ${timeoutMs}ms.`;
        const exitCode = err.code ?? err.status ?? 1;
        return formatResult(`TEST RUN — FAILED (exit ${exitCode})`, exitCode, truncate(err.stdout || ''), truncate(err.stderr || ''));
      }
    }

    case 'run_linter': {
      const { cwd, scopedPath: lintPath } = await resolveLinterContext(agentId, args, context);
      const pkgJson = await readPackageJson(cwd);
      if (!pkgJson) return 'Could not read package.json — unable to detect linter.';
      const hasLintScript = pkgJson.scripts?.lint;
      const eslintBin = await resolveLocalBin('eslint', cwd);

      if (lintPath && lintPath !== '.' && eslintBin) {
        try {
          const { stdout, stderr } = await runCommand(eslintBin, [lintPath], { cwd, timeout: 60000 });
          return formatResult('LINT (eslint scoped) — PASSED', 0, truncate(stdout), truncate(stderr));
        } catch (err) {
          if (err.code === 'ETIMEDOUT') return 'run_linter timed out after 60000ms.';
          const exitCode = err.code ?? err.status ?? 1;
          return formatResult(`LINT (eslint scoped) — ISSUES FOUND (exit ${exitCode})`, exitCode, truncate(err.stdout || ''), truncate(err.stderr || ''));
        }
      }

      if (hasLintScript) {
        try {
          const { stdout, stderr } = await runCommand('npm', ['run', 'lint'], { cwd, timeout: 60000 });
          return formatResult('LINT — PASSED', 0, truncate(stdout), truncate(stderr));
        } catch (err) {
          if (err.code === 'ETIMEDOUT') return 'run_linter timed out after 60000ms.';
          const exitCode = err.code ?? err.status ?? 1;
          return formatResult(`LINT — ISSUES FOUND (exit ${exitCode})`, exitCode, truncate(err.stdout || ''), truncate(err.stderr || ''));
        }
      }

      if (eslintBin) {
        try {
          const { stdout, stderr } = await runCommand(eslintBin, [lintPath], { cwd, timeout: 60000 });
          return formatResult('LINT (eslint) — PASSED', 0, truncate(stdout), truncate(stderr));
        } catch (err) {
          if (err.code === 'ETIMEDOUT') return 'run_linter timed out after 60000ms.';
          const exitCode = err.code ?? err.status ?? 1;
          return formatResult(`LINT (eslint) — ISSUES FOUND (exit ${exitCode})`, exitCode, truncate(err.stdout || ''), truncate(err.stderr || ''));
        }
      }

      return 'No lint script found in package.json and eslint is not installed in node_modules. ' +
        'Add a "lint" script or install eslint to enable this tool.';
    }

    default:
      throw new Error(`Unknown runner tool: ${name}`);
  }
}
