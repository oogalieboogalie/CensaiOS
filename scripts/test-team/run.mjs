#!/usr/bin/env node
// The test team: made-up people who use censaiOS the way real people do and
// write down, module by module, what works, what broke and at which step.
//
// For each module it starts the real server (scratch Postgres) and the real
// browser app, signs in Pat Example (first in, so the owner) and Sam Example
// (a teammate on Pat's shared board), and runs three parts: the walk (normal
// use), the bug hunt (wrong things on purpose) and the red team (the server's
// checks). Chats answer through a stand-in model, web searches through a
// stand-in Tavily, design imports through a stand-in Figma, Send to GitHub
// and agents' GitHub reads through a stand-in GitHub and the Grok chat's own
// sign-in through a stand-in Grok, so no AI, Tavily, Figma, GitHub or Grok
// key or account is needed.
//
// Usage:
//   E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/postgres npm run test-team -- music
//   npm run test-team -- next      (one module, chosen by the date)
//   npm run test-team -- all
//
// Settings: E2E_DATABASE_URL (required), CHROMIUM_PATH, TEST_TEAM_OUT (where
// reports go; default .homebase-state/test-team), TEST_TEAM_MODEL_PORT.
// Each module writes <out>/<module>/report.md, report.json and pictures.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  ROOT, dropScratchDatabase, findChromium, makeScratchDatabase, startProcess, step, waitForUrl, whatIsMissing,
} from '../e2e/runner.mjs';
import { PAT, SAM, callApi, openBoard, shareBoard, signIn } from '../e2e/board.mjs';
import { createReport, pickThemes, summarize, writeReport } from './report.mjs';
import { startStandinModel } from './standinModel.mjs';
import { startStandinTavily } from '../../tests/fixtures/leadHoundStandin.js';
import { startStandinFigma } from './standinFigma.mjs';
import { startStandinGithub } from './standinGithub.mjs';
import { pickModules } from './modules/index.mjs';
import { commonChecks } from './commonChecks.mjs';

const API_PORT = 3001; // vite.config.js sends /api and the sockets here
const WEB_PORT = 5173;
const WEB = `http://localhost:${WEB_PORT}`;
const VIEW = { width: 1440, height: 900 };

async function startApp(databaseUrl, stand, logDir, children) {
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    PORT: String(API_PORT),
    SESSION_SECRET: crypto.randomBytes(24).toString('hex'),
    CENSAI_MODE: 'local_desktop',
    CENSAI_ALLOW_DEVELOPER_LOGIN: 'true',
    APP_ORIGIN: WEB,
    NODE_ENV: 'development',
    LOG_DIR: logDir,
    AI_BASE_URL: `http://127.0.0.1:${stand.model.port}/v1`,
    AI_API_KEY: 'standin',
    AI_MODEL: 'standin',
    // OpenAI and Z.ai chats (with made-up keys) also reach the stand-in.
    OPENAI_BASE_URL: `http://127.0.0.1:${stand.model.port}/v1`,
    ZAI_BASE_URL: `http://127.0.0.1:${stand.model.port}/v1`,
    TAVILY_API_BASE: stand.tavily.url,
    FIGMA_API_BASE: stand.figma.url,
    CENSAI_GITHUB_API_URL: stand.github.url,
    // This computer's own GitHub key, made up. Every GitHub call the server
    // makes goes to CENSAI_GITHUB_API_URL (server/github/apiUrl.js), so the key
    // only ever reaches the stand-in GitHub.
    GITHUB_TOKEN: 'made-up-standin-github-key',
    // The GitHub window's reviewers and conflict fixer fetch the stand-in's
    // repositories with git, into this run's own folder.
    CENSAI_GITHUB_GIT_URL: stand.github.gitUrl,
    CENSAI_GITHUB_FIX_DIR: path.join(stand.cliData, 'github-fixes'),
    // Scheduled runs are checked every 5 seconds, so a test that moves a run's time sees it fire.
    SCHEDULER_POLL_INTERVAL_MS: '5000',
    // A stand-in for xAI's Grok CLI, which the Grok chat's own sign-in runs:
    // it prints a made-up link and code, calls the sign-in approved 8 seconds
    // later and names each person's sign-in after their folder. Everyone's
    // Grok sign-in lives in this run's own folder (not in the log folder,
    // which the common checks read).
    CENSAI_CLI_GROK_BIN: path.join(ROOT, 'tests', 'fixtures', 'cli-agents', 'standin-grok.mjs'),
    CENSAI_CLI_AGENT_DATA: stand.cliData,
    STANDIN_GROK_LOGIN_MS: '8000',
    STANDIN_GROK_ACCOUNT_FROM_HOME: '1',
    // A stand-in for Claude Code and Codex in the Agent Console: it reads, says,
    // writes and runs what a module puts in standin-script.json in this run's folder.
    CENSAI_CLI_CLAUDECODE_BIN: path.join(ROOT, 'tests', 'fixtures', 'cli-agents', 'standin-agent.mjs'),
    CENSAI_CLI_CODEX_BIN: path.join(ROOT, 'tests', 'fixtures', 'cli-agents', 'standin-agent.mjs'),
    STANDIN_SCRIPT: path.join(stand.cliData, 'standin-script.json'),
    STANDIN_DELAY_MS: '300',
    CENSAI_CLI_AGENT_ENV_PASS: [process.env.CENSAI_CLI_AGENT_ENV_PASS, 'STANDIN_GROK_LOGIN_MS,STANDIN_GROK_ACCOUNT_FROM_HOME,STANDIN_SCRIPT,STANDIN_DELAY_MS'].filter(Boolean).join(','),
  };
  await step('start the server', async () => {
    const server = startProcess(process.execPath, ['server.js'], { env, logFile: path.join(logDir, 'server.log') });
    children.push(server);
    await waitForUrl(`http://127.0.0.1:${API_PORT}/api/health`, 120_000, { child: server });
  });
  await step('start the browser app', async () => {
    const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
    const web = startProcess(process.execPath, [vite, '--port', String(WEB_PORT), '--strictPort'], { env, logFile: path.join(logDir, 'web.log') });
    children.push(web);
    await waitForUrl(`${WEB}/`, 120_000, { child: web });
  });
}

async function person(browser, who, theme) {
  // The app picks its first theme from the browser's light or dark setting.
  const ctx = await browser.newContext({ viewport: VIEW, colorScheme: theme });
  // Note every sound the page starts, so a tester can tell real playback from a label.
  await ctx.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function teamPlay(...args) {
      (window.__teamMedia ||= new Set()).add(this);
      return play.apply(this, args);
    };
  });
  await signIn(ctx, who, WEB);
  return { who, ctx, page: null, errors: [] };
}

async function freshPages(people, workspaceId) {
  for (const p of people) {
    await p.page?.close().catch(() => {});
    p.errors = [];
    p.page = await p.ctx.newPage();
    p.page.on('pageerror', (e) => p.errors.push(String(e.message).split('\n')[0].slice(0, 200)));
  }
  await Promise.all(people.map((p) => openBoard(p.page, workspaceId, WEB)));
  for (const p of people) {
    // The first-visit mission card would cover the windows in every picture.
    const skipMission = p.page.getByText('Skip mission');
    if (await skipMission.count()) await skipMission.first().click().catch(() => {});
  }
  // Start each module on an empty board; the board is shared, so Pat's clear reaches Sam.
  await people[0].page.evaluate(() => window.__e2eStore.getState().setWins([]));
  for (const p of people) {
    await p.page.evaluate(() => {
      const st = window.__e2eStore.getState();
      st.setPan?.({ x: 0, y: 0 });
      st.setZoom?.(1);
    });
  }
  await people[0].page.waitForTimeout(800);
}

async function runOnce(mod, ctx, outDir, theme) {
  const report = createReport({ module: mod.id, label: mod.label, outDir, theme });
  await freshPages([ctx.pat, ctx.sam], ctx.workspaceId);
  const typed = [];
  const t = {
    ...ctx, report, typed, web: WEB,
    check: report.check,
    api: (who, method, url, data) => callApi(who.ctx, WEB, method, url, data),
    serverLog: () => fs.readFileSync(path.join(ctx.logDir, 'server.log'), 'utf8'),
  };
  try {
    await mod.run(t);
  } catch (error) {
    await report.check('walk', 'the module run itself', () => { throw error; });
  }
  await commonChecks(t);
  return report;
}

async function runModule(mod, ctx) {
  const outDir = path.join(ctx.outRoot, mod.id);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const reports = [];
  for (const theme of ctx.themes) {
    const { pat, sam } = ctx.people[theme];
    reports.push(await runOnce(mod, { ...ctx, pat, sam }, outDir, theme));
    // Off the board before the next theme, so its pictures show no pointer left from this one.
    await Promise.all([pat, sam].map((p) => p.page?.close().catch(() => {})));
  }
  const [main, ...others] = reports;
  const { verdict } = writeReport(main, outDir, others);
  const worst = reports.map((r) => summarize(r.checks).verdict).find((v) => v !== 'works') || verdict;
  console.log(`test-team ${mod.id}: ${worst}; report in ${path.join(outDir, 'report.md')}`);
  return worst;
}

async function main() {
  const modules = pickModules(process.argv.slice(2).join(' ') || 'next');
  const { default: pg } = await import('pg');
  const chromiumPath = findChromium();
  const missing = await whatIsMissing({ chromium: chromiumPath, pg });
  if (missing) {
    console.log(`test-team: skipped: no ${missing} on this runner`);
    return;
  }
  const { chromium } = await import('playwright-core');
  const outRoot = path.resolve(process.env.TEST_TEAM_OUT || path.join(ROOT, '.homebase-state', 'test-team'));
  const dbName = `censai_team_${Date.now()}`;
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-team-'));
  const cliData = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-team-cli-'));
  const children = [];
  let browser;
  let model;
  let tavily;
  let figma;
  let github;
  const verdicts = [];
  try {
    model = await startStandinModel(Number(process.env.TEST_TEAM_MODEL_PORT) || 11434);
    tavily = await startStandinTavily();
    figma = await startStandinFigma();
    github = await startStandinGithub();
    const databaseUrl = await step('scratch database', () => makeScratchDatabase(pg, process.env.E2E_DATABASE_URL, dbName));
    await startApp(databaseUrl, { model, tavily, figma, github, cliData }, logDir, children);
    browser = await chromium.launch({ executablePath: chromiumPath, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    // Pat signs in first, so Pat owns this computer; Sam is a teammate.
    const themes = pickThemes();
    const people = {};
    for (const theme of themes) people[theme] = { pat: await person(browser, PAT, theme), sam: await person(browser, SAM, theme) };
    const first = people[themes[0]];
    const workspaceId = await step('Pat shares the board with Sam', () => shareBoard(first.pat.ctx, SAM, WEB));
    const signedOut = await browser.newContext({ viewport: VIEW });
    const ctx = { ...first, people, themes, signedOut, workspaceId, outRoot, logDir, cliData, model, tavily, figma, github, browser, databaseUrl };
    for (const mod of modules) verdicts.push(await runModule(mod, ctx));
  } catch (error) {
    console.log(`test-team: could not start: ${String(error.message).split('\n')[0]}`);
    console.log(`test-team: server and app output kept in ${logDir}`);
    process.exitCode = 1;
  } finally {
    await browser?.close().catch(() => {});
    for (const child of children) child.kill('SIGTERM');
    await model?.close();
    await tavily?.close();
    await figma?.close();
    await github?.close();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await dropScratchDatabase(pg, process.env.E2E_DATABASE_URL, dbName).catch(() => {});
    fs.rmSync(cliData, { recursive: true, force: true });
  }
  if (verdicts.some((v) => v !== 'works')) process.exitCode = 1;
}

main();
