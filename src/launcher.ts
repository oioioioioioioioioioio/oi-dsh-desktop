#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { desktopHelp, parseDesktopArgs } from './args.js'
import { desktopManifest } from './package-meta.js'

function electronExecutable(): string {
  const loaded: unknown = createRequire(import.meta.url)('electron')
  if (typeof loaded !== 'string' || loaded.length === 0) {
    throw new Error('Electron executable could not be resolved')
  }
  return loaded
}

async function launch(): Promise<number> {
  const args = process.argv.slice(2)
  const options = parseDesktopArgs(args)
  if (options.help) {
    process.stdout.write(`${desktopHelp()}\n`)
    return 0
  }
  if (options.version) {
    process.stdout.write(`${desktopManifest().version}\n`)
    return 0
  }
  const main = fileURLToPath(new URL('./main.js', import.meta.url))
  return new Promise<number>((resolve, reject) => {
    const child = spawn(electronExecutable(), [main, ...args], {
      stdio: 'inherit',
      windowsHide: true,
      env: { ...process.env, OI_DSH_NODE_EXECUTABLE: process.execPath },
    })
    const interrupt = (): void => { if (!child.killed) child.kill('SIGINT') }
    const terminate = (): void => { if (!child.killed) child.kill('SIGTERM') }
    process.once('SIGINT', interrupt)
    process.once('SIGTERM', terminate)
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      process.removeListener('SIGINT', interrupt)
      process.removeListener('SIGTERM', terminate)
      resolve(code ?? (signal === null ? 1 : 128))
    })
  })
}

void launch().then(
  code => { process.exitCode = code },
  (error: unknown) => {
    process.stderr.write(`oi-dsh-desktop: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  },
)
