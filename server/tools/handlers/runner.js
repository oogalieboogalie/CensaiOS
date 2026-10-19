import { truncate, readPackageJson, formatResult, runCommand, resolveLocalBin, resolveRunnerContext, resolveLinterContext } from './runnerUtils.js';

// The runner hands back { stdout, stderr, code } and throws only when it could
// not run at all, so a failing exit code has to be read, not caught.
async function outcome({ passed, failed, timedOut }, command, args, options) {
  try {
    const { stdout, stderr, code = 0 } = await runCommand(command, args, options);
    return code === 0
      ? formatResult(passed, 0, truncate(stdout), truncate(stderr))
      : formatResult(`${failed} (exit ${code})`, code, truncate(stdout), truncate(stderr));
  } catch (err) {
    if (err.code === 'ETIMEDOUT') return timedOut;
    const exitCode = err.code ?? err.status ?? 1;
    return formatResult(`${failed} (exit ${exitCode})`, exitCode, truncate(err.stdout || ''), truncate(err.stderr || ''));
  }
}

const LINT_TIMEOUT = 'run_linter timed out after 60000ms.';

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
      return outcome({
        passed: 'TEST RUN — SUCCESS', failed: 'TEST RUN — FAILED', timedOut: `run_tests timed out after ${timeoutMs}ms.`,
      }, 'npm', npmArgs, { cwd, timeout: timeoutMs });
    }

    case 'run_linter': {
      const { cwd, scopedPath: lintPath } = await resolveLinterContext(agentId, args, context);
      const pkgJson = await readPackageJson(cwd);
      if (!pkgJson) return 'Could not read package.json — unable to detect linter.';
      const hasLintScript = pkgJson.scripts?.lint;
      const eslintBin = await resolveLocalBin('eslint', cwd);

      if (lintPath && lintPath !== '.' && eslintBin) {
        return outcome({
          passed: 'LINT (eslint scoped) — PASSED', failed: 'LINT (eslint scoped) — ISSUES FOUND', timedOut: LINT_TIMEOUT,
        }, eslintBin, [lintPath], { cwd, timeout: 60000 });
      }

      if (hasLintScript) {
        return outcome({
          passed: 'LINT — PASSED', failed: 'LINT — ISSUES FOUND', timedOut: LINT_TIMEOUT,
        }, 'npm', ['run', 'lint'], { cwd, timeout: 60000 });
      }

      if (eslintBin) {
        return outcome({
          passed: 'LINT (eslint) — PASSED', failed: 'LINT (eslint) — ISSUES FOUND', timedOut: LINT_TIMEOUT,
        }, eslintBin, [lintPath], { cwd, timeout: 60000 });
      }

      return 'No lint script found in package.json and eslint is not installed in node_modules. ' +
        'Add a "lint" script or install eslint to enable this tool.';
    }

    default:
      throw new Error(`Unknown runner tool: ${name}`);
  }
}
