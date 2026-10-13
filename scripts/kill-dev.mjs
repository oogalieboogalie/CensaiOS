// scripts/kill-dev.mjs — stop local dev processes, then wait for ports to free.
//
// WHY: `npm run kill` used to be fire-and-forget Stop-Process. Kills are
// asynchronous: launching dev 1-2s later could hit EADDRINUSE on :3001 while
// the dying process still held it — instant server crash, cryptic failure.
// This script kills, then polls until :3001/:5173 refuse connections
// (max ~10s) so the next launch starts clean. stdlib only.

import { execSync } from 'node:child_process'
import net from 'node:net'

const PORTS = [3001, 5173]
const SETTLE_MS = 10_000

function listNodePids() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH', { encoding: 'utf8' })
      return out
        .split('\n')
        .map(l => l.split('","')[1])
        .filter(pid => pid && /^\d+$/.test(pid.trim()))
        .map(Number)
        .filter(pid => pid !== process.pid)
    }
    const out = execSync('pgrep -f node', { encoding: 'utf8' })
    return out.split('\n').map(Number).filter(pid => pid && pid !== process.pid)
  } catch {
    return []
  }
}

function kill(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' })
    } else {
      process.kill(pid, 'SIGKILL')
    }
    return true
  } catch {
    return false
  }
}

function portOpen(port) {
  return new Promise(resolve => {
    const s = net.connect(port, '127.0.0.1')
    s.on('connect', () => {
      s.destroy()
      resolve(true)
    })
    s.on('error', () => resolve(false))
    s.setTimeout(500, () => {
      s.destroy()
      resolve(false)
    })
  })
}

async function main() {
  const pids = listNodePids()
  if (pids.length === 0) console.log('kill-dev: no node processes found')
  let killed = 0
  for (const pid of pids) {
    if (kill(pid)) killed++
  }
  console.log(`kill-dev: signaled ${killed}/${pids.length} node process(es)`)

  const deadline = Date.now() + SETTLE_MS
  for (;;) {
    const states = await Promise.all(PORTS.map(portOpen))
    if (states.every(open => !open)) {
      console.log(`kill-dev: ports ${PORTS.join('/')} free — safe to launch`)
      return
    }
    if (Date.now() > deadline) {
      const busy = PORTS.filter((_, i) => states[i])
      console.error(`kill-dev: TIMEOUT — still listening: ${busy.join(', ')}. Something outside node holds them (docker? another app?).`)
      process.exit(1)
    }
    await new Promise(r => setTimeout(r, 250))
  }
}

main()
