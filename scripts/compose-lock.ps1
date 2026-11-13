# One lock for starting, building, or swapping censaiOS. The desktop
# launcher and the sign-in updater both run "docker compose". If they do
# it together, Docker reports a container-name conflict and the launcher
# shows a red error.
#
#   powershell -File scripts\compose-lock.ps1 -Who launcher
#   powershell -File scripts\compose-lock.ps1 -Who swap
#   powershell -File scripts\compose-lock.ps1 -Who build
#   powershell -File scripts\compose-lock.ps1 -Who start
# Exit 0: compose finished. Exit 1: compose failed. Exit 10: the other
# side holds the lock. A build uses the same lock, so two builds cannot
# run at once. A build does not start the containers. -Who start waits
# for that build to finish, then runs "docker compose up -d" with no
# --build.

param([string]$Who = '')

$ErrorActionPreference = 'Continue'
if ($Who -ne 'launcher' -and $Who -ne 'swap' -and $Who -ne 'build' -and $Who -ne 'start') {
  Write-Error 'Say -Who launcher, -Who swap, -Who build, or -Who start.'
  exit 1
}

Set-Location (Split-Path -Parent $PSScriptRoot)
# The launcher reads this word to tell a build from a swap. ascii, no
# BOM, so findstr can match it. Cleared before the lock is let go.
$whoFile = Join-Path (Get-Location) '.homebase-state\update\compose-who.txt'
$mutex = New-Object System.Threading.Mutex($false, 'Local\censaiOS-compose')

function Take-Lock([int]$ms) {
  try {
    return [bool]$mutex.WaitOne($ms)
  } catch {
    $inner = $_.Exception.InnerException
    if ($_.Exception -is [System.Threading.AbandonedMutexException] -or $inner -is [System.Threading.AbandonedMutexException]) {
      return $true
    }
    throw
  }
}

function Read-Holder {
  if (-not (Test-Path -LiteralPath $whoFile)) { return '' }
  return "$((Get-Content -Raw -LiteralPath $whoFile))".Trim()
}

$got = $false
if ($Who -eq 'start') {
  # A build holds the lock and is not starting the containers. Wait until
  # it lets go, however long that takes. A swap that takes the lock
  # instead is already starting them.
  while (-not $got) {
    $got = Take-Lock 3000
    if ($got) { break }
    $holder = Read-Holder
    if ($holder -eq 'build') { continue }
    # The name was just cleared and the lock is about to open, or an
    # older holder never wrote one. A short wait catches the first.
    $got = Take-Lock 2000
    if ($got) { break }
    exit 10
  }
} else {
  # The launcher waits up to a minute and a half for a swap to finish.
  # The updater only looks: if the launcher is starting the app, it tries later.
  $waitMs = 0
  if ($Who -eq 'launcher') { $waitMs = 90000 }
  $got = Take-Lock $waitMs
  if (-not $got) {
    if ($Who -eq 'launcher') {
      Write-Host 'An update is being put in, so this start waits for it instead of building again.'
    }
    exit 10
  }
}

$code = 1
try {
  $dir = Split-Path -Parent $whoFile
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  Set-Content -LiteralPath $whoFile -Value $Who -Encoding ascii -NoNewline
  if ($Who -eq 'launcher') { & docker compose up -d --build }
  elseif ($Who -eq 'build') { & docker compose build --quiet }
  elseif ($Who -eq 'start') { & docker compose up -d }
  else { & docker compose up -d }
  if ($LASTEXITCODE -eq 0) { $code = 0 }
} finally {
  Remove-Item -LiteralPath $whoFile -Force -ErrorAction SilentlyContinue
  try { [void]$mutex.ReleaseMutex() } catch { }
  $mutex.Dispose()
}
exit $code
