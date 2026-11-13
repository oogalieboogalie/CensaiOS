// Terraform writes every value it manages into its state, passwords too
// (terraform.tfstate and its backups), and reads values from *.tfvars files,
// by itself (terraform.tfvars, *.auto.tfvars) or when handed one
// (-var-file=prod.tfvars). All of them count as files that hold keys: only
// this computer's owner opens them, saved versions and Send to GitHub leave
// them out, and a coding agent's step that names one shows a teammate only
// its title. Their examples (prod.tfvars.example) and Terraform's own code
// (main.tf) stay ordinary. All names and words are made up.
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { isSecretFileName, secretRepoPath } from '../server/security/secretFiles.js';
import { keptOutOfVersions } from '../server/projectGit/keptOut.js';
import { saveVersion, startVersions } from '../server/projectGit/git.js';
import { sendToGithub } from '../server/projectGit/publish.js';
import { namesOwnerOnly, stepForTeammate } from '../server/cli-agents/ownerOnlySteps.js';
import { fakeGithubRepos } from './fixtures/fakeGithubRepos.js';

const ROOT = '/made-up/.censai/worktrees/made-up-task';
const PASSWORD = 'made-up-state-password';
const made = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-terraform-'));
  made.push(dir);
  return dir;
};
afterAll(() => made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

describe("Terraform's files hold keys", () => {
  test.each([
    // The state Terraform writes, its backups (one per `terraform state` change too), the one it leaves when a save fails, and its lock.
    'terraform.tfstate', 'terraform.tfstate.backup', 'terraform.tfstate.1700000000.backup', 'errored.tfstate', 'made-up-staging.tfstate',
    'example.tfstate', '.terraform.tfstate.lock.info', 'TERRAFORM.TFSTATE',
    // Values handed to it by hand, and the ones it reads by itself, whatever their names say.
    'prod.tfvars', 'made-up-staging.tfvars', 'prod.tfvars.json', '.tfvars', 'example.auto.tfvars', 'made-up.template.auto.tfvars',
    'example.auto.tfvars.json',
    // Terraform's own settings on Windows, which keep its sign-in like .terraformrc does.
    'terraform.rc',
  ])('%s', (name) => expect(isSecretFileName(name)).toBe(true));

  test.each([
    'terraform.tfstate~', 'terraform (1).tfstate', 'terraform.tfstate.bak', 'terraform.tfstate - Copy', 'prod copy.tfvars', 'prod.tfvars.bak',
    '.prod.tfvars.swp', 'prod (2).tfvars.json', 'terraform.tfstate.', 'prod.tfvars::$DATA',
  ])('%s, a copy, a backup or a name Windows opens as one, holds keys too', (name) => expect(isSecretFileName(name)).toBe(true));

  test.each([
    // Examples, which say so after the name or before Terraform's ending.
    'prod.tfvars.example', 'prod.tfvars.json.sample', 'terraform.tfstate.example', 'terraform.rc.example', 'prod.example.tfvars',
    'example.tfvars', 'prod_sample.tfvars.json', 'made-up-template.tfvars', 'terraform.example.tfvars',
    // Terraform's own code and lock, notes about its files, and the folder of its workspaces' states.
    'variables.tf', 'main.tf', 'outputs.tf', 'override.tf', '.terraform.lock.hcl', 'made-up.tfvars.md', 'made-up.tfstate.md',
    'tfstate-notes.txt', 'terraform.tfstate.d', 'crash.log',
  ])('%s, a look-alike, does not', (name) => expect(isSecretFileName(name)).toBe(false));

  test('a long name is judged in time', () => {
    const started = Date.now();
    for (let at = 0; at < 2000; at += 1) {
      isSecretFileName(`${'a.'.repeat(120)}tfstate`);
      isSecretFileName(`${'.auto'.repeat(50)}.tfvars`);
      isSecretFileName(`${'a'.repeat(240)}.tfvars.jso`);
    }
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('where they are kept back', () => {
  test('saved versions leave them out wherever they sit, workspaces included, and keep their examples', () => {
    for (const rel of ['infra/terraform.tfstate', 'infra/terraform.tfstate.backup', 'terraform.tfstate.d/made-up-staging/terraform.tfstate', 'infra/prod.tfvars', 'infra\\prod.tfvars.json']) {
      expect(keptOutOfVersions(rel)).toBe(true);
    }
    for (const rel of ['infra/prod.tfvars.example', 'infra/main.tf', '.terraform.lock.hcl', 'terraform.tfstate.d/']) expect(keptOutOfVersions(rel)).toBe(false);
  });

  test('saving versions and Send to GitHub leave them out and keep them on this computer', async () => {
    const author = { name: 'Pat Example', email: 'pat@example.com' };
    const KEPT = ['infra/terraform.tfstate', 'infra/terraform.tfstate.backup', 'terraform.tfstate.d/made-up-staging/terraform.tfstate', 'infra/prod.tfvars', 'infra/prod.tfvars.json'];
    const SHOWN = ['index.html', 'infra/main.tf', 'infra/prod.tfvars.example', '.terraform.lock.hcl'];
    const dir = tmp();
    const write = (rel, words = `made_up_password = "${PASSWORD}"\n`) => {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), words);
    };
    for (const rel of KEPT) write(rel);
    for (const rel of SHOWN) write(rel, `Made-up words of ${rel}\n`);
    const started = await startVersions(dir, { author });
    const filesIn = () => execFileSync('git', ['-C', dir, 'ls-tree', '-r', '--name-only', 'HEAD'], { encoding: 'utf8' }).trim().split('\n');
    expect(filesIn().sort()).toEqual([...SHOWN].sort());
    expect([...started.keptOut].sort()).toEqual([...KEPT].sort());

    write('infra/terraform.tfstate', `{"password": "${PASSWORD}-changed"}\n`);
    write('index.html', 'Made-up page, second version');
    const saved = await saveVersion(dir, { message: 'Second page', author });
    expect([...saved.keptOut].sort()).toEqual([...KEPT].sort());
    expect(execFileSync('git', ['-C', dir, 'log', '--all', '-p'], { encoding: 'utf8' })).not.toContain(PASSWORD);

    const github = fakeGithubRepos(tmp());
    await sendToGithub(dir, { token: 'made-up-token', title: 'First page', author, repoName: 'Made up infra', octokit: github });
    expect(github.pathsIn('made-up-infra').sort()).toEqual([...SHOWN].sort());
    for (const rel of KEPT) expect(fs.readFileSync(path.join(dir, rel), 'utf8')).toContain(PASSWORD);
  });

  test('a read of a GitHub repo through an agent or a project keeps them back', () => {
    for (const rel of ['infra/terraform.tfstate', 'infra/prod.tfvars.json', 'a/../terraform.tfstate.backup', 'infra/prod.tfvars?ref=main']) expect(secretRepoPath(rel)).toBe(true);
    for (const rel of ['infra/prod.tfvars.example', 'infra/main.tf', 'docs/made-up.tfstate.md']) expect(secretRepoPath(rel)).toBe(false);
  });
});

describe("a coding agent's command that names one", () => {
  test.each([
    'cat infra/terraform.tfstate', 'jq .resources infra/terraform.tfstate.backup', 'cp terraform.tfstate /made-up/out',
    'terraform plan -var-file=prod.tfvars', 'terraform apply -var-file="made up/prod.tfvars"', `cat ${ROOT}/infra/prod.tfvars.json`,
    'cat infra/*.tfstate*', 'cat infra/*.tfvars.json', 'cat infra/prod*.tfvars', 'cat terraform.tfstate.d/*/terraform.tfstate',
  ])('%s shows a teammate only its title', (command) => expect(namesOwnerOnly(command, { root: ROOT })).toBe(true));

  test.each([
    'terraform init', 'terraform plan -var-file=prod.example.tfvars', 'cat infra/main.tf infra/variables.tf', 'cat infra/prod.tfvars.example',
    'cat *.tf', 'cat .terraform.lock.hcl',
  ])('%s, which names only ordinary files, shows', (command) => expect(namesOwnerOnly(command, { root: ROOT })).toBe(false));

  test("a teammate sees such a step's title only, and a search's lines from a state file are left out of another step", () => {
    const step = { id: 'c1', kind: 'command', title: 'Look at the state', command: 'cat infra/terraform.tfstate', output: `{"password": "${PASSWORD}"}` };
    const seen = stepForTeammate(step, { root: ROOT });
    expect(seen).toMatchObject({ title: 'Look at the state', ownerOnly: true });
    expect(JSON.stringify(seen)).not.toContain(PASSWORD);
    const search = { id: 'c2', kind: 'command', title: 'Search', command: 'grep -rn password infra', output: `infra/terraform.tfstate:12:  "password": "${PASSWORD}"\ninfra/main.tf:3:  password = var.made_up` };
    expect(stepForTeammate(search, { root: ROOT }).output.split('\n')).toEqual(['infra/terraform.tfstate: …', 'infra/main.tf:3:  password = var.made_up']);
  });
});
