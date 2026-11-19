# Is this PC's censaiOS running on another computer?
#
# When censaiOS moves to a home server, this PC keeps its desktop app
# and forwards localhost:3002 to that server with a Windows port forward
# (netsh interface portproxy). Then the server builds and updates censaiOS
# (scripts/auto-update.sh there), and this PC must not start Docker or build
# its own copy: that copy could never take port 3002, and it is not the one
# the app shows.
#
# Exit 0 and print where it goes when localhost:3002 is forwarded.
# Exit 1 when censaiOS runs on this PC.

$ErrorActionPreference = 'SilentlyContinue'
$forwards = @(netsh interface portproxy show all 2>$null)
foreach ($line in $forwards) {
  # "127.0.0.1       3002        10.10.0.1       3022"
  if ("$line" -match '^\s*(127\.0\.0\.1|localhost|::1|0\.0\.0\.0|\*)\s+3002\s+(\S+)\s+(\d+)\s*$') {
    Write-Output "$($Matches[2]):$($Matches[3])"
    exit 0
  }
}
exit 1
