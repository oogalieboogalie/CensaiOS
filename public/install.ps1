# Censai installer (Windows PowerShell)
#
#   irm https://censai.app/install.ps1 | iex
#
# What it does, in order:
#   1. Checks that Docker Desktop (with Compose v2) is installed and running.
#   2. Downloads the public CensaiOS source into %USERPROFILE%\.censai\CensaiOS
#      (no git needed; an existing .env is preserved across re-runs).
#   3. Creates .env from .env.example and fills in random secrets.
#   4. Starts the stack with the prebuilt image from GHCR.
#   5. Waits for http://localhost:3002 to report ready, then opens it.
#
# Re-run the same command to update. Data lives in Docker volumes and survives.
#
# Environment overrides (set before running):
#   $env:CENSAI_HOME  = 'D:\censai'                 install root
#   $env:CENSAI_REF   = 'main'                      branch or tag
#   $env:CENSAI_REPO  = 'oogalieboogalie/CensaiOS'  GitHub repo
#   $env:CENSAI_BUILD = '1'                         build from source instead of pulling

$ErrorActionPreference = 'Stop'

$Repo    = if ($env:CENSAI_REPO) { $env:CENSAI_REPO } else { 'oogalieboogalie/CensaiOS' }
$Ref     = if ($env:CENSAI_REF)  { $env:CENSAI_REF }  else { 'main' }
$Home_   = if ($env:CENSAI_HOME) { $env:CENSAI_HOME } else { Join-Path $env:USERPROFILE '.censai' }
$AppDir  = Join-Path $Home_ 'CensaiOS'
$AppUrl  = 'http://localhost:3002'
$Build   = $env:CENSAI_BUILD -eq '1'

function Say($m)  { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host " + $m" -ForegroundColor Green }
function Fail($m) { Write-Host "censai: $m" -ForegroundColor Red; exit 1 }

function New-RandomHex {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
}

# Fill KEY= only if it is missing or empty.
function Set-SecretIfEmpty($file, $key) {
  $lines = @(Get-Content $file)
  $idx = [Array]::FindIndex($lines, [Predicate[string]]{ param($l) $l -like "$key=*" })
  if ($idx -ge 0 -and $lines[$idx].Substring($key.Length + 1).Trim() -ne '') { return }
  $value = "$key=$(New-RandomHex)"
  if ($idx -ge 0) { $lines[$idx] = $value } else { $lines += $value }
  Set-Content -Path $file -Value $lines -Encoding utf8
  Ok "generated $key"
}

# ---------------------------------------------------------------- 1. checks
Say 'Checking prerequisites'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail 'Docker is required. Install Docker Desktop: https://docs.docker.com/get-docker/'
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail 'Docker is installed but not running. Start Docker Desktop, then re-run this installer.' }
docker compose version *> $null
if ($LASTEXITCODE -ne 0) { Fail "Docker Compose v2 is required (the 'docker compose' command). Update Docker Desktop." }
Ok 'docker is running'

# -------------------------------------------------------------- 2. download
Say "Downloading CensaiOS ($Ref) into $AppDir"
New-Item -ItemType Directory -Force -Path $Home_ | Out-Null
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("censai-" + [System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
  $zip = Join-Path $tmp 'src.zip'
  Invoke-WebRequest -Uri "https://github.com/$Repo/archive/$Ref.zip" -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath (Join-Path $tmp 'src') -Force
  $extracted = Get-ChildItem (Join-Path $tmp 'src') -Directory | Select-Object -First 1
  if (-not $extracted) { Fail 'archive did not contain a source directory' }

  $newDir = "$AppDir.new"; $oldDir = "$AppDir.old"
  foreach ($d in @($newDir, $oldDir)) { if (Test-Path $d) { Remove-Item $d -Recurse -Force } }
  Move-Item $extracted.FullName $newDir
  if (Test-Path (Join-Path $AppDir '.env')) { Copy-Item (Join-Path $AppDir '.env') (Join-Path $newDir '.env') }
  if (Test-Path $AppDir) { Move-Item $AppDir $oldDir }
  Move-Item $newDir $AppDir
  if (Test-Path $oldDir) { Remove-Item $oldDir -Recurse -Force }
  Ok 'source ready'
} finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

# ------------------------------------------------------------------ 3. .env
Set-Location $AppDir
if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Ok 'created .env from .env.example'
}
Set-SecretIfEmpty '.env' 'SESSION_SECRET'
Set-SecretIfEmpty '.env' 'JOURNAL_SECRET'
Set-SecretIfEmpty '.env' 'CENSAI_VAULT_SECRET'

# Docker rejects uppercase image names; older checkouts of the override still
# spell the repo with capitals. Normalise before compose sees it.
if (Test-Path 'docker-compose.ghcr.yml') {
  $override = Get-Content 'docker-compose.ghcr.yml' -Raw
  if ($override -cmatch 'ghcr\.io/oogalieboogalie/CensaiOS') {
    Set-Content 'docker-compose.ghcr.yml' ($override -creplace 'ghcr\.io/oogalieboogalie/CensaiOS', 'ghcr.io/oogalieboogalie/censaios') -NoNewline
  }
}

# ----------------------------------------------------------------- 4. start
if ($Build) {
  Say 'Building from source and starting (this takes a few minutes the first time)'
  docker compose up -d --build
} else {
  Say 'Pulling the latest public image and starting'
  docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
}
if ($LASTEXITCODE -ne 0) { Fail 'docker compose failed. See the output above.' }

# ------------------------------------------------------------------ 5. wait
Say "Waiting for Censai to come up at $AppUrl"
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "$AppUrl/api/ready" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $ready = $true; break }
  } catch { }
  Write-Host -NoNewline '.'
  Start-Sleep -Seconds 2
}
Write-Host ''
if (-not $ready) { Fail "timed out waiting for $AppUrl. Check logs with: docker compose logs -f homebase (in $AppDir)" }

Start-Process $AppUrl | Out-Null

Write-Host ''
Write-Host "  Censai is running:  $AppUrl"
Write-Host ''
Write-Host "  Installed in:       $AppDir"
Write-Host "  Stop:               cd `"$AppDir`"; docker compose down"
Write-Host "  Logs:               cd `"$AppDir`"; docker compose logs -f"
Write-Host '  Update:             re-run this installer'
Write-Host ''
Write-Host '  Local models: install Ollama (https://ollama.com), then'
Write-Host '    ollama pull qwen3-coder:latest'
Write-Host '    ollama pull nomic-embed-text'
Write-Host '  Or add a provider key in Settings inside the app.'
Write-Host ''
