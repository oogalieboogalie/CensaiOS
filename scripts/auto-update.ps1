# Keeps this PC's censaiOS on the newest master while it runs.
#
# run-homebase-desktop.bat starts this hidden at every launch (one copy at a
# time). scripts\updater-signin.ps1 also starts it when you sign in to
# Windows, so a restart of the PC does not leave a built update sitting
# unused. Every few minutes it fetches master; when there is something new it
# pulls (fast-forward only, so local changes are never thrown away), builds
# the new Docker app in the background while the old one keeps running, and
# writes .homebase-state\update\ready.json. The app shows "Update ready" and
# its Restart button writes .homebase-state\update\restart-requested, which
# this script answers with `docker compose up -d` (the image is already
# built, so the swap takes seconds). When this script starts and a build is
# already made, and the server says nobody is working, it puts that build in
# without waiting for a click (scripts\updater-apply.ps1). The tray's
# "Update censaiOS" item (via the app) writes check-requested to look right
# away instead of waiting for the next round; every look ends in
# checked.json { at, result }. Closing and reopening censaiOS with the
# shortcut also puts a ready update in.
#
#   -Once            one check (and a waiting restart), then exit; for tests
#   -CheckMinutes N  how often to look for an update (default 5)
# LaunchedBy is the censaios-updater link when the update panel starts this.
# It is ignored. It is first so that link is not read as the number of minutes.
param(
  [string]$LaunchedBy,
  [int]$CheckMinutes = 5,
  [switch]$Once
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root '.homebase-state\update'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$logFile = Join-Path $dir 'auto-update.log'
$rebuildMarker = Join-Path $root '.homebase-state\self-fix\rebuild-needed'
Set-Location $root

# One copy at a time: a second launch just leaves.
$mutex = New-Object System.Threading.Mutex($false, 'Local\censaiOS-auto-update')
if (-not $mutex.WaitOne(0)) { exit 0 }

function Write-Log([string]$message) {
  Add-Content -Path $logFile -Value "$(Get-Date -Format o) $message"
  if ((Get-Item $logFile).Length -gt 512KB) {
    Get-Content $logFile -Tail 400 | Set-Content "$logFile.tmp"
    Move-Item -Force "$logFile.tmp" $logFile
  }
}

function Read-Value([string]$name) {
  $file = Join-Path $dir $name
  if (Test-Path $file) { return ((Get-Content $file -Raw) -as [string]).Trim().TrimStart([char]0xFEFF).Trim() }
  return ''
}

function Write-Value([string]$name, [string]$value) {
  $file = Join-Path $dir $name
  # UTF-8 without a BOM: the launcher reads running.txt with `set /p`.
  [System.IO.File]::WriteAllText("$file.tmp", $value, (New-Object System.Text.UTF8Encoding($false)))
  Move-Item -Force "$file.tmp" $file
}

function Get-Head { return ((& git rev-parse HEAD 2>$null) -as [string]).Trim() }

function Write-Heartbeat {
  Write-Value 'watcher.json' (@{ pid = $PID; at = (Get-Date).ToUniversalTime().ToString('o'); every = $CheckMinutes } | ConvertTo-Json -Compress)
}

# Fetch master and fast-forward to it. Self-fix fixes are taken out first and
# put back after, exactly like the launcher does.
function Update-Code {
  $branch = ((& git rev-parse --abbrev-ref HEAD 2>$null) -as [string]).Trim()
  & git fetch --quiet origin master *> $null
  $fetched = $LASTEXITCODE -eq 0
  # Not on master (someone switched this folder to a side branch): updates cannot
  # flow, and saying "up to date" would be untrue. Say it is paused, every round,
  # so the app can show it instead of going quiet.
  if ($branch -ne 'master') {
    $script:paused = $true
    $waiting = [int]((& git rev-list --count HEAD..origin/master 2>$null) -as [string])
    $why = "This PC's censaiOS folder is on the side branch '$branch', not master, so it is not getting updates. GitHub's master has $waiting change(s) this PC does not have. Nothing was changed. Get this branch's commits into master with a pull request, then switch this folder back to master so updates can flow again."
    if ((Read-Value 'blocked.txt') -ne $why) { Write-Log "updates paused: $why" }
    Write-Value 'blocked.txt' $why
    return
  }
  if (-not $fetched) { return }
  $behind = [int]((& git rev-list --count HEAD..origin/master 2>$null) -as [string])
  if ($behind -eq 0) {
    Remove-Item -Force (Join-Path $dir 'blocked.txt') -ErrorAction SilentlyContinue
    return
  }
  # Commits made on this PC that GitHub does not have: a fast-forward can never
  # work, so say so plainly instead of trying (and failing) every round.
  $ahead = [int]((& git rev-list --count origin/master..HEAD 2>$null) -as [string])
  if ($ahead -gt 0) {
    $script:blocked = $true
    $why = "This PC's master has $ahead commit(s) that are not on GitHub, and GitHub has $behind new one(s), so censaiOS cannot update by itself. Nothing was changed. Push this PC's commits to a branch and open a pull request, then point master back at GitHub's (git branch -f master origin/master while on another branch) so updates can flow again."
    if ((Read-Value 'blocked.txt') -ne $why) { Write-Log "update blocked: $why" }
    Write-Value 'blocked.txt' $why
    return
  }
  Write-Log "master has $behind new commit(s), pulling"
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'self-fix-patches.ps1') -Mode unapply *> $null
  $out = & git pull --ff-only --quiet origin master 2>&1
  if ($LASTEXITCODE -ne 0) {
    $script:blocked = $true
    Write-Log "pull refused (local changes?), keeping this version: $out"
    Write-Value 'blocked.txt' "$out"
  } else {
    Remove-Item -Force (Join-Path $dir 'blocked.txt') -ErrorAction SilentlyContinue
  }
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'self-fix-patches.ps1') -Mode apply *> $null
}

# Build the app for the current code while the running one keeps going.
function Build-App {
  $head = Get-Head
  & docker info *> $null
  if ($LASTEXITCODE -ne 0) { return $false }
  Write-Log "building $head"
  # The same lock as a start or a swap. If one of those is running, do not
  # start a second build. The next look tries again.
  $lock = Join-Path $PSScriptRoot 'compose-lock.ps1'
  $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $lock -Who build 2>&1
  if ($LASTEXITCODE -eq 10) {
    Write-Log 'a build is already running, so this one waits'
    return 'locked'
  }
  if ($LASTEXITCODE -ne 0) {
    Write-Log "build failed: $(($out | Select-Object -Last 15) -join ' | ')"
    return $false
  }
  Write-Value 'built.txt' $head
  Remove-Item -Force $rebuildMarker -ErrorAction SilentlyContinue
  Write-Log "built $head"
  return $true
}

# What the app reads for its "Update ready" note.
function Write-Ready {
  $head = Get-Head
  $running = Read-Value 'running.txt'
  $changes = @()
  if ($running) {
    # GitHub puts the pull request's title in the merge commit's body.
    $changes = @(& git log --merges --first-parent --format=%b "$running..$head" 2>$null |
      Where-Object { $_.Trim() } | Select-Object -First 20)
  }
  $ready = @{ commit = $head; from = $running; builtAt = (Get-Date).ToUniversalTime().ToString('o'); changes = $changes }
  Write-Value 'ready.json' ($ready | ConvertTo-Json -Compress)
}

function Test-Behind {
  return (Get-Head) -ne (Read-Value 'running.txt') -or (Test-Path $rebuildMarker)
}

function Invoke-Check {
  $script:blocked = $false
  $script:paused = $false
  Update-Code
  if (-not (Test-Behind)) {
    Remove-Item -Force (Join-Path $dir 'ready.json') -ErrorAction SilentlyContinue
    if ($script:paused) { return 'side-branch' }
    if ($script:blocked) { return 'blocked' }
    return 'up-to-date'
  }
  if ((Read-Value 'built.txt') -ne (Get-Head) -or (Test-Path $rebuildMarker)) {
    & docker info *> $null
    if ($LASTEXITCODE -ne 0) { return 'docker-off' }
    $built = @(Build-App)[-1]
    if ($built -eq 'locked') { return 'locked' }
    if ($built -ne $true) { return 'build-failed' }
  }
  Write-Ready
  return 'ready'
}

# One look, and what it found for the app's update panel.
function Invoke-Look([string]$why) {
  $result = 'up-to-date'
  try { $result = @(Invoke-Check)[-1] } catch { Write-Log "check failed: $_"; $result = 'build-failed' }
  # Someone else is already building. Leave the last note and try later.
  if ($result -eq 'locked') { return }
  Write-Value 'checked.json' (@{ at = (Get-Date).ToUniversalTime().ToString('o'); result = $result } | ConvertTo-Json -Compress)
  if ($why) { Write-Log "$why check: $result" }
}

# The app asked for a restart: swap in the image that is already built.
# 'done' it is in, 'failed' compose did not finish, 'locked' the launcher
# is starting censaiOS so this waits, 'none' nobody asked.
function Invoke-Restart {
  $request = Join-Path $dir 'restart-requested'
  if (-not (Test-Path $request)) { return 'none' }
  Remove-Item -Force $request -ErrorAction SilentlyContinue
  $head = Get-Head
  if ((Read-Value 'built.txt') -ne $head) {
    $built = @(Build-App)[-1]
    if ($built -eq 'locked') {
      New-Item -ItemType File -Force -Path $request | Out-Null
      return 'locked'
    }
    if ($built -ne $true) { return 'failed' }
  }
  $lock = Join-Path $PSScriptRoot 'compose-lock.ps1'
  & powershell -NoProfile -ExecutionPolicy Bypass -File $lock -Who swap *> $null
  if ($LASTEXITCODE -eq 10) {
    New-Item -ItemType File -Force -Path $request | Out-Null
    return 'locked'
  }
  if ($LASTEXITCODE -ne 0) { return 'failed' }
  Write-Value 'running.txt' $head
  Remove-Item -Force (Join-Path $dir 'ready.json') -ErrorAction SilentlyContinue
  Write-Log "censaiOS now runs $head"
  return 'done'
}

Write-Log "watching for updates every $CheckMinutes minute(s) (pid $PID)"
. (Join-Path $PSScriptRoot 'updater-apply.ps1')
$next = Get-Date
$applyUntil = (Get-Date).AddMinutes(10)
$applySettled = $false
$swapFails = 0
$nextSwapTry = Get-Date
$saidBusy = $false
# A failed swap waits 1 minute, then 2, then 5, and then stops.
# Three failures is the end. The last wait is not followed by another try.
$swapBackoffMinutes = @(1, 2, 5)
$swapStopAfterWait = $false
while ($true) {
  Write-Heartbeat
  $didApply = $false
  if (-not $applySettled -and (Get-Date) -ge $nextSwapTry) {
    if ($swapStopAfterWait) {
      Write-Log 'could not put the built update in after 3 tries, so it stays ready'
      $applySettled = $true
    } else {
      $apply = 'later'
      # The last word is the result. Anything printed along the way must not
      # turn it into a list, or a "try again" would be treated as finished.
      try { $apply = @(Invoke-ApplyBuiltIfIdle)[-1] } catch { $apply = 'failed' }
      if ($apply -eq 'put-in') { $didApply = $true; $applySettled = $true }
      elseif ($apply -eq 'busy') {
        if (-not $saidBusy) { Write-Log 'Update ready, restarts when you are done'; $saidBusy = $true }
      }
      elseif ($apply -eq 'locked') {
        # The launcher is starting censaiOS. Look again on the next pass.
      }
      elseif ($apply -eq 'failed') {
        $nextSwapTry = (Get-Date).AddMinutes($swapBackoffMinutes[$swapFails])
        $swapFails += 1
        # The third failure has waited its 5 minutes once this time arrives.
        # Do not run docker compose a fourth time.
        if ($swapFails -ge $swapBackoffMinutes.Count) { $swapStopAfterWait = $true }
      }
      elseif ($apply -ne 'later') { $applySettled = $true }
      elseif ((Get-Date) -ge $applyUntil) {
        $applySettled = $true
        Write-Log 'censaiOS did not come up free, so a built update was left as it is'
      }
    }
  }
  if (-not $didApply) {
    $asked = Join-Path $dir 'check-requested'
    if (Test-Path $asked) {
      Remove-Item -Force $asked -ErrorAction SilentlyContinue
      Invoke-Look 'asked-for'
      $next = (Get-Date).AddMinutes($CheckMinutes)
    } elseif ((Get-Date) -ge $next) {
      Invoke-Look ''
      $next = (Get-Date).AddMinutes($CheckMinutes)
    }
  }
  try {
    $restarted = @(Invoke-Restart)[-1]
    # A person asked, and it went in. Do not log that the automatic tries failed.
    if ($restarted -eq 'done') { $applySettled = $true; $swapStopAfterWait = $false }
  } catch { Write-Log 'restart failed' }
  if ($Once) { break }
  Start-Sleep -Seconds 3
}
