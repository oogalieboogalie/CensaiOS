# Starts the censaiOS updater when you sign in to Windows, for this account
# only, and removes that again. The desktop launcher and the installer set
# this up once and say so. stop-homebase.bat and an uninstall take it away.
#
#   powershell -ExecutionPolicy Bypass -File scripts\updater-signin.ps1 -Install
#   powershell -ExecutionPolicy Bypass -File scripts\updater-signin.ps1 -Remove

param([switch]$Install, [switch]$Remove)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$script = Join-Path $repo 'scripts\auto-update.ps1'
# The signed-in person's own Startup folder, not every account on the PC.
$startup = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startup 'censaiOS Updater.lnk'
$protocol = 'censaios-updater'
$protocolKey = "HKCU:\Software\Classes\$protocol"
$launch = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""

function Remove-SignIn {
  $gone = $false
  if (Test-Path $lnk) { Remove-Item $lnk -Force; $gone = $true }
  if (Test-Path $protocolKey) { Remove-Item $protocolKey -Recurse -Force; $gone = $true }
  if ($gone) {
    Write-Host "censaiOS will no longer start its updater when you sign in."
  } else {
    Write-Host "censaiOS was not set to start its updater when you sign in."
  }
}

function Install-SignIn {
  if (-not (Test-Path $script)) { Write-Error "Missing: $script"; exit 1 }
  $shell = New-Object -ComObject WScript.Shell
  $same = $false
  if ((Test-Path $lnk) -and (Test-Path $protocolKey)) {
    $existing = $shell.CreateShortcut($lnk)
    $same = $existing.Arguments -like "*$script*"
  }
  if ($same) { return }

  if (-not (Test-Path $startup)) { New-Item -ItemType Directory -Force -Path $startup | Out-Null }
  $s = $shell.CreateShortcut($lnk)
  $s.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $s.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
  $s.WorkingDirectory = $repo
  $s.WindowStyle = 7
  $s.Description = 'Keep censaiOS up to date after you sign in'
  $s.Save()

  New-Item -Path $protocolKey -Force | Out-Null
  Set-ItemProperty -Path $protocolKey -Name '(default)' -Value 'URL:censaiOS Updater'
  New-ItemProperty -Path $protocolKey -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
  $commandKey = Join-Path $protocolKey 'shell\open\command'
  New-Item -Path $commandKey -Force | Out-Null
  Set-ItemProperty -Path $commandKey -Name '(default)' -Value $launch

  Write-Host "censaiOS will start its updater when you sign in to Windows, so an update can still go in after a restart."
}

if ($Remove) { Remove-SignIn; exit 0 }
if (-not $Install) { Write-Error 'Say -Install or -Remove.'; exit 1 }
Install-SignIn
