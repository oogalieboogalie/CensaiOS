# Called by scripts\auto-update.ps1 when the updater starts.
# If a build is already made and newer than the app that is running, and
# the server says nobody is working, put that build in. The yes/no is
# server/appUpdate/applyWhenIdle.js (GET /api/app-update/idle). This file
# only asks and, when told, runs the same swap as a Restart click.

function Test-DockerUp {
  & docker info *> $null
  return $LASTEXITCODE -eq 0
}

function Test-ServerUp {
  try {
    $health = Invoke-WebRequest -Uri 'http://127.0.0.1:3002/api/health' -UseBasicParsing -TimeoutSec 3
    return $health.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Get-IdleAnswer {
  try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3002/api/app-update/idle' -UseBasicParsing -TimeoutSec 5
    $found = $response.Content | ConvertFrom-Json
    if ($null -eq $found.putIn) { return @{ failed = $true; status = 0 } }
    return $found
  } catch {
    $status = 0
    try { $status = [int]$_.Exception.Response.StatusCode } catch { $status = 0 }
    return @{ failed = $true; status = $status }
  }
}

# 'put-in' the build went in, 'left' it stays for a person, 'nothing' no
# build is waiting, 'later' Docker or censaiOS is not up yet so try again.
function Invoke-ApplyBuiltIfIdle {
  if (-not (Test-DockerUp)) { return 'later' }
  if (-not (Test-ServerUp)) { return 'later' }
  $answer = Get-IdleAnswer
  if ($answer.failed) {
    if ($answer.status -eq 404) {
      Write-Log "censaiOS could not say whether anyone is using it, so a built update stays ready"
      return 'left'
    }
    return 'later'
  }
  if (-not $answer.ready) { return 'nothing' }
  # 'busy' means try again later: a terminal, a console agent, or the app
  # was used in the last 10 minutes. 'left' means stop asking.
  if ($answer.working) { return 'busy' }
  if (-not $answer.putIn) {
    Write-Log "a built update is waiting and censaiOS said to leave it, so it stays ready"
    return 'left'
  }
  Write-Log "a built update is waiting and nobody is using censaiOS, putting it in"
  $built = Read-Value 'built.txt'
  New-Item -ItemType File -Force -Path (Join-Path $dir 'restart-requested') | Out-Null
  $result = 'failed'
  try { $result = @(Invoke-Restart)[-1] } catch { $result = 'failed' }
  if ($result -eq 'locked') { return 'locked' }
  if ($result -eq 'done' -or ((Read-Value 'running.txt') -eq $built -and $built)) { return 'put-in' }
  return 'failed'
}
