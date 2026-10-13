import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export function scheduleLocalDevRestart({ id, cwd, noticeSeconds = 5, port = 3001 }) {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://homebase:homebase@127.0.0.1:5433/homebase';
  const safeCwd = cwd.replace(/'/g, "''");
  const escapedCwd = cwd.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  const logPath = `${process.env.TEMP || cwd}\\homebase-codex-dev.log`;
  const runnerLogPath = `${process.env.TEMP || cwd}\\homebase-local-dev-restart.log`;
  const timeZone = (process.env.LOCAL_DEV_TIME_ZONE || 'America/Chicago').replace(/'/g, "''");
  const hasDockerCompose = fs.existsSync(path.join(cwd, 'docker-compose.yml'));

  const script = `
$ErrorActionPreference = 'Continue'
$env:DATABASE_URL = '${databaseUrl.replace(/'/g, "''")}'
$env:LOCAL_DEV_RESTART_ID = '${id}'
$restartId = '${id}'
$repo = '${safeCwd}'
$log = '${logPath.replace(/'/g, "''")}'
$runnerLog = '${runnerLogPath.replace(/'/g, "''")}'
"[$(Get-Date -Format o)] Restart runner started for $restartId" | Out-File -FilePath $runnerLog -Append -Encoding utf8

function Update-RestartStatus([string]$status, [string]$message) {
  $env:LOCAL_DEV_RESTART_STATUS = $status
  $env:LOCAL_DEV_RESTART_ERROR = $message
@'
import 'dotenv/config';
import pg from 'pg';

const id = process.env.LOCAL_DEV_RESTART_ID;
const status = process.env.LOCAL_DEV_RESTART_STATUS;
const error = process.env.LOCAL_DEV_RESTART_ERROR || null;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  if (status === 'restarting') {
    await pool.query(
      "UPDATE local_dev_restarts SET status = 'restarting', restart_started_at = NOW() WHERE id = $1",
      [id]
    );
  } else if (status === 'completed') {
    await pool.query(
      \`UPDATE local_dev_restarts
       SET status = 'completed',
           restart_completed_at = NOW(),
           completion_message =
             'Restart complete at ' || to_char(NOW() AT TIME ZONE '${timeZone}', 'YYYY-MM-DD HH24:MI:SS') || ' ${timeZone}' ||
             ': Started at ' || to_char(COALESCE(restart_started_at, requested_at) AT TIME ZONE '${timeZone}', 'YYYY-MM-DD HH24:MI:SS') || ' ${timeZone}' ||
             ' initiated by ' || initiated_by ||
             ' reason ' || COALESCE(NULLIF(reason, ''), 'not specified')
       WHERE id = $1\`,
      [id]
    );
  } else if (status === 'failed') {
    await pool.query(
      "UPDATE local_dev_restarts SET status = 'failed', error = $2 WHERE id = $1",
      [id, error]
    );
  }
} finally {
  await pool.end();
}
'@ | node --input-type=module
  if ($LASTEXITCODE -ne 0) {
    "[$(Get-Date -Format o)] Failed to update restart status: $status" | Out-File -FilePath $runnerLog -Append -Encoding utf8
  } else {
    "[$(Get-Date -Format o)] Restart status updated: $status" | Out-File -FilePath $runnerLog -Append -Encoding utf8
  }
}

Set-Location $repo
Start-Sleep -Seconds ${Math.max(0, Number(noticeSeconds) || 0)}
Update-RestartStatus 'restarting' ''

if (${hasDockerCompose ? '$true' : '$false'}) {
  docker compose up -d --build postgres qdrant homebase >> $runnerLog 2>&1
  if ($LASTEXITCODE -ne 0) {
    Update-RestartStatus 'failed' 'Docker Compose stack restart failed. Check homebase-local-dev-restart.log.'
    exit 1
  }
  "[$(Get-Date -Format o)] Started Docker Compose stack" | Out-File -FilePath $runnerLog -Append -Encoding utf8
} else {
  $nodes = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
    Where-Object {
      (($_.CommandLine -match '${escapedCwd}') -or
       ($_.CommandLine -match 'node\\s+server\\.js')) -and
      ($_.ProcessId -ne ${process.env.LOCAL_DEV_RESTART_EXCLUDE_PID || 0})
    }
  $nodes | ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
  }
  "[$(Get-Date -Format o)] Stopped matching node processes" | Out-File -FilePath $runnerLog -Append -Encoding utf8

  Start-Sleep -Seconds 1
  $devCommand = 'cd /d "' + $repo + '" && npm run dev >> "' + $log + '" 2>&1'
  Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d','/s','/c', $devCommand) -WorkingDirectory $repo -WindowStyle Hidden
  "[$(Get-Date -Format o)] Started npm run dev" | Out-File -FilePath $runnerLog -Append -Encoding utf8
}

$deadline = (Get-Date).AddSeconds(45)
$healthy = $false
$healthUrls = @("http://127.0.0.1:${port}/api/health")
if (${hasDockerCompose ? '$true' : '$false'}) {
  try {
    $published = docker compose port homebase 3001 2>$null
    if ($published -match ':(\\d+)$') {
      $healthUrls += "http://127.0.0.1:$($matches[1])/api/health"
    }
  } catch {}
  $healthUrls += "http://127.0.0.1:3002/api/health"
}
$healthUrls = $healthUrls | Select-Object -Unique
do {
  Start-Sleep -Seconds 2
  foreach ($healthUrl in $healthUrls) {
    try {
      $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
      if ($health.ok -and $health.database -and $health.taskWorker.ready) { $healthy = $true; break }
    } catch {}
  }
} while ((Get-Date) -lt $deadline)

if ($healthy) {
  Update-RestartStatus 'completed' ''
} else {
  Update-RestartStatus 'failed' 'Restart command ran, but /api/health did not become healthy before timeout.'
}
`;

  const runnerDir = path.join(cwd, '.homebase-state', 'restart-runners');
  fs.mkdirSync(runnerDir, { recursive: true });
  const runnerPath = path.join(runnerDir, `${id}.ps1`);
  fs.writeFileSync(runnerPath, script, 'utf8');

  const child = spawn('cmd.exe', [
    '/d',
    '/c',
    'start',
    '""',
    '/min',
    'powershell.exe',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    runnerPath,
  ], {
    cwd,
    stdio: 'ignore',
    detached: true,
    windowsHide: true,
  });
  child.unref();
}
