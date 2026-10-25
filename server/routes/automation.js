import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import { requireLocalFilesystem } from '../middleware/runtimeMode.js';
import { createLogger } from '../logger.js';

const log = createLogger('automation');
const defaultExec = promisify(exec);
let execAsync = defaultExec;
let platform = () => os.platform();
export const automationRouter = express.Router();

// Tests swap in a fake PowerShell and platform.
export function setAutomationRunnerForTests({ exec: fakeExec, platform: fakePlatform } = {}) {
  execAsync = fakeExec || defaultExec;
  platform = fakePlatform || (() => os.platform());
}

const ACTIONS = {
  run: { verb: 'Start', words: 'start', notWindows: 'Running tasks is only supported on Windows' },
  enable: { verb: 'Enable', words: 'turn on', notWindows: 'Enabling tasks is only supported on Windows' },
  disable: { verb: 'Disable', words: 'turn off', notWindows: 'Disabling tasks is only supported on Windows' },
};

const ALLOWED_TASKS = [
  'CensaiJulesQueue',
  'CensaiOverseer',
  'OpenHubQueue',
  'OpenHubOverseer'
];

// Status reads are allowed to fail quietly (a task may not exist yet);
// the buttons use { strict: true } so a Windows refusal reaches the window.
async function runPowerShell(command, { strict = false, step = 'status' } = {}) {
  try {
    const { stdout } = await execAsync(`powershell.exe -NoProfile -NonInteractive -Command "${command}"`);
    return stdout;
  } catch (err) {
    log.warn('powershell call failed', { step, code: err.code ?? null });
    if (strict) throw err;
    return null;
  }
}

async function readJsonSafely(filepath) {
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn('queue file read failed', { file: filepath.split('/').pop(), code: err.code || 'parse' });
    return null;
  }
}

automationRouter.get('/status', requireLocalFilesystem, async (req, res) => {
  try {
    const isWindows = platform() === 'win32';
    const statusResult = {};
    // Additive fields for the Automation Board UI: host (where the task runs) and
    // currentStep (a free-text description of what the task is doing right now).
    // Both default to null so older clients that ignore unknown keys keep working.
    const host = os.hostname();
    const baseExtras = { host, currentStep: null };

    for (const task of ALLOWED_TASKS) {
      statusResult[task] = { armed: false, state: 'Unknown', lastRunTime: null, nextRunTime: null, lastTaskResult: null, pending: 0, dispatched: 0, ...baseExtras };
    }

    if (isWindows) {
      for (const task of ALLOWED_TASKS) {
        // Fetch state
        const stateOutput = await runPowerShell(`(Get-ScheduledTask -TaskName '${task}' -ErrorAction SilentlyContinue).State`);

        // Fetch info
        const infoOutput = await runPowerShell(`Get-ScheduledTaskInfo -TaskName '${task}' -ErrorAction SilentlyContinue | Select-Object LastRunTime, NextRunTime, LastTaskResult | ConvertTo-Json`);

        if (stateOutput || infoOutput) {
           statusResult[task].armed = true;
           statusResult[task].state = stateOutput ? stateOutput.trim() : 'Unknown';

           if (infoOutput) {
             try {
               const parsedInfo = JSON.parse(infoOutput);
               if (parsedInfo.LastRunTime) {
                  // Powershell returns something like "/Date(162...)/", converting it or using the raw string if already formatted
                  const match = /\\\/Date\((\d+)\)\\\//.exec(parsedInfo.LastRunTime);
                  if (match) {
                     statusResult[task].lastRunTime = new Date(parseInt(match[1], 10)).toISOString();
                  } else {
                     statusResult[task].lastRunTime = parsedInfo.LastRunTime;
                  }
               }
               if (parsedInfo.NextRunTime) {
                  const match = /\\\/Date\((\d+)\)\\\//.exec(parsedInfo.NextRunTime);
                  if (match) {
                     statusResult[task].nextRunTime = new Date(parseInt(match[1], 10)).toISOString();
                  } else {
                     statusResult[task].nextRunTime = parsedInfo.NextRunTime;
                  }
               }
               statusResult[task].lastTaskResult = parsedInfo.LastTaskResult;
             } catch (e) {
               // Ignore parse error
             }
           }
        }
      }
    }

    // Read queue files
    const queueData = await readJsonSafely('.team/handoffs/queue.json');
    if (queueData) {
      statusResult['CensaiJulesQueue'].pending = queueData.pending ? queueData.pending.length : 0;
      statusResult['CensaiJulesQueue'].dispatched = queueData.dispatched ? queueData.dispatched.length : 0;
    }

    const openHubQueueData = await readJsonSafely('.team/handoffs/openhub-queue.json');
    if (openHubQueueData) {
      statusResult['OpenHubQueue'].pending = openHubQueueData.pending ? openHubQueueData.pending.length : 0;
      statusResult['OpenHubQueue'].dispatched = openHubQueueData.dispatched ? openHubQueueData.dispatched.length : 0;
    }

    const overseerData = await readJsonSafely('.team/handoffs/overseer-state.json');
    if (overseerData) {
      // Not mapping explicitly to pending/dispatched, but attach it to the task
      statusResult['CensaiOverseer'].metadata = overseerData;
      // Surface a free-text "what is it doing" hint so the Automation Board UI
      // can show it without needing to read the file itself. Additive — clients
      // that don't know about `currentStep` simply ignore it.
      if (overseerData.current && typeof overseerData.current === 'string') {
        statusResult['CensaiOverseer'].currentStep = overseerData.current;
      }
    }

    res.json(statusResult);
  } catch (err) {
    log.error('status read failed', { code: err.code || null });
    res.status(500).json({ error: 'Could not read the automation status.' });
  }
});

automationRouter.post('/:task/:action', requireLocalFilesystem, async (req, res) => {
  const { task, action } = req.params;
  const spec = ACTIONS[action];
  if (!spec) return res.status(404).json({ error: 'Unknown action' });
  if (!ALLOWED_TASKS.includes(task)) {
    return res.status(400).json({ error: 'Invalid task name' });
  }
  if (platform() !== 'win32') {
    return res.status(400).json({ error: spec.notWindows });
  }

  try {
    await runPowerShell(`${spec.verb}-ScheduledTask -TaskName '${task}'`, { strict: true, step: action });
    log.info('task button worked', { task, action });
    res.json({ success: true });
  } catch (err) {
    log.warn('task button refused by windows', { task, action, code: err.code ?? null });
    res.status(502).json({ error: `Windows did not ${spec.words} ${task}. It may be missing, or censaiOS may need to run as an administrator.` });
  }
});
