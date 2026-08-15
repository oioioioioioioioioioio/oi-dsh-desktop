import { packager } from '@electron/packager'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  HARNESS_EXTENSION_VERSION,
  harnessPatchPath,
  legacyHarnessPatchPaths,
} from 'oi-dsh-desktop-bundle/harness-extension'
import { packageRoot } from './package-meta.js'

const HARNESS_PACKAGE = '@deepseek-ai/dsh-root'
const RUNTIME_RELATIVE = '.artifacts/electron-runtime'
const OUTPUT_RELATIVE = 'dist'
const PACKAGE_DIRECTORY = 'oi-dsh-desktop-win32-x64'
const EXECUTABLE = 'oi-dsh-desktop.exe'

interface HarnessManifest {
  readonly name?: string
  readonly version?: string
}

interface ProcessResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

export function resolveHarnessRoot(explicit?: string, desktopRoot = packageRoot()): string {
  const root = resolve(explicit ?? join(desktopRoot, '..'))
  const manifestPath = join(root, 'package.json')
  if (!existsSync(manifestPath)) {
    throw new Error(`DeepSeek Harness package.json was not found at ${manifestPath}`)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as HarnessManifest
  if (manifest.name !== HARNESS_PACKAGE) {
    throw new Error(`${root} is not a DeepSeek Harness source root`)
  }
  return root
}

export function packagedDesktopPath(harnessRoot: string): string {
  return join(resolve(harnessRoot), OUTPUT_RELATIVE, PACKAGE_DIRECTORY, EXECUTABLE)
}

export async function installHarnessExtension(harnessRoot: string): Promise<void> {
  const patch = harnessPatchPath()
  if ((await runCaptured('git', ['apply', '--reverse', '--check', patch], harnessRoot, true)).code === 0) {
    process.stdout.write(`Harness desktop extension ${HARNESS_EXTENSION_VERSION} is already installed.\n`)
    return
  }

  const check = await runCaptured('git', ['apply', '--check', patch], harnessRoot, true)
  if (check.code === 0) {
    await applyHarnessPatch(harnessRoot, patch, 'Applying Harness desktop extension')
    return
  }

  for (const legacyPatch of legacyHarnessPatchPaths()) {
    const legacyInstalled = await runCaptured(
      'git', ['apply', '--reverse', '--check', legacyPatch], harnessRoot, true,
    )
    if (legacyInstalled.code !== 0) continue
    await upgradeHarnessPatch(harnessRoot, legacyPatch, patch)
    return
  }

  const revisionResult = await runCaptured('git', ['rev-parse', '--short', 'HEAD'], harnessRoot, true)
  const revision = revisionResult.code === 0 ? revisionResult.stdout.trim() : 'unknown'
  throw new Error(
    `Harness source at ${revision} is not compatible with desktop extension ${HARNESS_EXTENSION_VERSION}:\n${check.stderr.trim()}`,
  )
}

async function applyHarnessPatch(harnessRoot: string, patch: string, label: string): Promise<void> {
  await run('git', ['apply', '--whitespace=nowarn', patch], harnessRoot, label)
}

async function upgradeHarnessPatch(harnessRoot: string, legacyPatch: string, patch: string): Promise<void> {
  process.stdout.write(`Upgrading Harness desktop extension to ${HARNESS_EXTENSION_VERSION}...\n`)
  await run(
    'git', ['apply', '--reverse', '--whitespace=nowarn', legacyPatch],
    harnessRoot, 'Removing previous Harness desktop extension',
  )
  try {
    const check = await runCaptured('git', ['apply', '--check', patch], harnessRoot, true)
    if (check.code !== 0) throw new Error(`updated Harness extension cannot be applied:\n${check.stderr.trim()}`)
    await applyHarnessPatch(harnessRoot, patch, 'Applying updated Harness desktop extension')
  } catch (error) {
    try {
      await applyHarnessPatch(harnessRoot, legacyPatch, 'Restoring previous Harness desktop extension')
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError], 'Harness desktop extension upgrade and rollback both failed',
      )
    }
    throw error
  }
}

export async function buildPackagedDesktop(harnessRoot: string): Promise<string> {
  const patch = harnessPatchPath()
  const installed = await runCaptured('git', ['apply', '--reverse', '--check', patch], harnessRoot, true)
  if (installed.code !== 0) {
    await installHarnessExtension(harnessRoot)
  }

  const pnpm = pnpmCli()
  await run(process.execPath, [pnpm, 'install', '--frozen-lockfile'], harnessRoot, 'Installing Harness dependencies')
  await run(process.execPath, [pnpm, 'run', 'build:electron'], harnessRoot, 'Building Electron IPC runtime')

  const runtimeRoot = join(harnessRoot, RUNTIME_RELATIVE)
  const runtimeManifest = join(runtimeRoot, 'package.json')
  const electronManifest = join(runtimeRoot, 'node_modules', 'electron', 'package.json')
  if (!existsSync(runtimeManifest) || !existsSync(electronManifest)) {
    throw new Error(`Electron runtime is incomplete at ${runtimeRoot}`)
  }
  const electronVersion = (JSON.parse(readFileSync(electronManifest, 'utf8')) as HarnessManifest).version
  if (electronVersion === undefined) throw new Error(`Electron version is missing from ${electronManifest}`)

  const out = join(harnessRoot, OUTPUT_RELATIVE)
  assertChild(harnessRoot, out)
  process.stdout.write('Packaging Windows desktop executable...\n')
  const paths = await packager({
    dir: runtimeRoot,
    out,
    name: 'oi-dsh-desktop',
    executableName: 'oi-dsh-desktop',
    platform: 'win32',
    arch: process.arch === 'arm64' ? 'arm64' : 'x64',
    electronVersion,
    overwrite: true,
    prune: false,
    derefSymlinks: true,
    asar: false,
    appVersion: HARNESS_EXTENSION_VERSION,
    win32metadata: {
      CompanyName: '0i Open Source',
      FileDescription: 'DeepSeek Harness Desktop',
      OriginalFilename: EXECUTABLE,
      ProductName: 'DeepSeek Harness Desktop',
    },
  })
  const directory = paths[0]
  if (directory === undefined) throw new Error('Electron Packager returned no Windows application')
  const executable = join(directory, EXECUTABLE)
  if (!existsSync(executable)) throw new Error(`packaged executable is missing: ${executable}`)
  process.stdout.write(`Desktop executable ready: ${executable}\n`)
  return executable
}

export async function setupPackagedDesktop(harnessRoot: string): Promise<string> {
  await installHarnessExtension(harnessRoot)
  return buildPackagedDesktop(harnessRoot)
}

export function startPackagedDesktop(harnessRoot: string): void {
  const executable = packagedDesktopPath(harnessRoot)
  if (!existsSync(executable)) {
    throw new Error(`desktop executable is not built; run npm run setup first (${executable})`)
  }
  const child = spawn(executable, [], {
    cwd: dirname(executable),
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
}

function pnpmCli(): string {
  const manifest = createRequire(import.meta.url).resolve('pnpm')
  const cli = join(dirname(manifest), 'bin', 'pnpm.cjs')
  if (!existsSync(cli)) throw new Error(`pnpm CLI is missing: ${cli}`)
  return cli
}

async function run(
  command: string,
  args: readonly string[],
  cwd: string,
  label: string,
): Promise<void> {
  process.stdout.write(`${label}...\n`)
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(command, [...args], { cwd, stdio: 'inherit', windowsHide: true })
    child.once('error', rejectRun)
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun()
      else rejectRun(new Error(`${label} failed (${signal ?? `exit ${String(code)}`})`))
    })
  })
}

async function runCaptured(
  command: string,
  args: readonly string[],
  cwd: string,
  allowFailure = false,
): Promise<ProcessResult> {
  const result = await new Promise<ProcessResult>((resolveRun, rejectRun) => {
    const child = spawn(command, [...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.once('error', rejectRun)
    child.once('exit', code => { resolveRun({ code: code ?? 1, stdout, stderr }) })
  })
  if (!allowFailure && result.code !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr.trim()}`)
  }
  return result
}

function assertChild(root: string, target: string): void {
  const path = relative(resolve(root), resolve(target))
  if (path === '' || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new Error(`output must be below the Harness source root: ${target}`)
  }
}
