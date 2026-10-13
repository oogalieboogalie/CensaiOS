#!/usr/bin/env node
// `npm run desktop` — start the Tauri desktop app in dev mode.
// Rustup installs cargo to ~/.cargo/bin but a fresh terminal often doesn't have
// it on PATH yet, which makes `tauri dev` die with "cargo not found". Add it here
// so the one command works from any terminal.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const cargoBin = path.join(process.env.CARGO_HOME || path.join(os.homedir(), '.cargo'), 'bin')
const env = { ...process.env }
const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') || 'PATH'
if (fs.existsSync(cargoBin) && !(env[pathKey] || '').split(path.delimiter).includes(cargoBin)) {
  env[pathKey] = `${cargoBin}${path.delimiter}${env[pathKey] || ''}`
}

const child = spawn('npx', ['tauri', 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32'
})
child.on('exit', code => process.exit(code ?? 1))
