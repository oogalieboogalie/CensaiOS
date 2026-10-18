/**
 * GitHub Copilot CLI in headless mode:
 *   copilot -p <task> --allow-tool write [--model <id>]
 *
 * Copilot takes the task as an argument (`-p`), so the adapter passes it as
 * one argv element and never through a shell. It prints plain text, not
 * JSON, so every line streams into one assistant message. In headless mode
 * it cannot stop and ask: `--allow-tool write` lets it edit files in the
 * task's worktree, and shell commands stay denied unless the person's own
 * Copilot config allows them.
 */

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export const copilot = {
  id: 'copilot',
  label: 'Copilot CLI',
  vendor: 'GitHub',
  binary: 'copilot',
  npmPackage: '@github/copilot',
  keyEnv: 'GH_TOKEN',
  vaultProvider: 'github',
  loginFiles: ['.copilot/config.json'],
  homepage: 'https://github.com/github/copilot-cli',
  gate: 'auto-edit',
  gateNote: 'Edits files in its worktree on its own; shell commands follow your Copilot settings.',
  aliases: {},
  taskInArgs: true,

  buildRun({ task, model, readOnly = false }) {
    const args = readOnly ? ['-p', task] : ['-p', task, '--allow-tool', 'write'];
    if (model && SAFE_ID.test(model)) args.push('--model', model);
    return { args, stdin: [], keepStdinOpen: false };
  },

  createParser() {
    // One message per run; the time keeps ids unique across follow-up turns.
    const id = `copilot-${Date.now().toString(36)}`;
    let started = false;
    return function parse(event, raw) {
      const text = raw ?? (event && typeof event === 'object' ? JSON.stringify(event) : '');
      if (!text) return [];
      if (!started) {
        started = true;
        return [{ op: 'add', item: { id, kind: 'message', role: 'assistant', text } }];
      }
      return [{ op: 'append', id, text: `\n${text}` }];
    };
  },
};
