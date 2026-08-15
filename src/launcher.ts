#!/usr/bin/env node

import { resolve } from 'node:path'
import {
  buildPackagedDesktop,
  installHarnessExtension,
  resolveHarnessRoot,
  setupPackagedDesktop,
  startPackagedDesktop,
} from './installer.js'

type Command = 'setup' | 'install' | 'build' | 'start'

interface CliOptions {
  readonly command: Command
  readonly harnessRoot?: string
  readonly help: boolean
}

function parseArgs(argv: readonly string[]): CliOptions {
  let command: Command = 'start'
  let commandSeen = false
  let harnessRoot: string | undefined
  let help = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === undefined) break
    if (!argument.startsWith('-') && !commandSeen) {
      if (!['setup', 'install', 'build', 'start'].includes(argument)) {
        throw new Error(`unknown command ${JSON.stringify(argument)}`)
      }
      command = argument as Command
      commandSeen = true
      continue
    }
    switch (argument) {
      case '--harness-root': {
        const value = argv[index + 1]
        if (value === undefined || value === '' || value.startsWith('--')) {
          throw new Error('--harness-root requires a directory')
        }
        harnessRoot = resolve(value)
        index += 1
        break
      }
      case '-h':
      case '--help':
        help = true
        break
      default:
        throw new Error(`unknown option ${JSON.stringify(argument)}`)
    }
  }
  return {
    command,
    ...(harnessRoot === undefined ? {} : { harnessRoot }),
    help,
  }
}

function helpText(): string {
  return [
    'Usage: oi-dsh-desktop <command> [options]',
    '',
    'Commands:',
    '  setup      install the Harness extension, build it, and package the EXE',
    '  install    apply the source extension only',
    '  build      build and package an already installed extension',
    '  start      launch the generated desktop EXE (default)',
    '',
    'Options:',
    '  --harness-root <path>          Harness source root (default: parent directory)',
    '  -h, --help                     show this help',
  ].join('\n')
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(`${helpText()}\n`)
    return
  }
  const harnessRoot = resolveHarnessRoot(options.harnessRoot)
  switch (options.command) {
    case 'install':
      await installHarnessExtension(harnessRoot)
      return
    case 'build':
      await buildPackagedDesktop(harnessRoot)
      return
    case 'setup':
      await setupPackagedDesktop(harnessRoot)
      return
    case 'start':
      startPackagedDesktop(harnessRoot)
      return
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`oi-dsh-desktop: ${formatError(error)}\n`)
  process.exitCode = 1
})

function formatError(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  while (current !== undefined) {
    parts.push(current instanceof Error ? current.message : String(current))
    current = current instanceof Error ? current.cause : undefined
  }
  return parts.join('\ncaused by: ')
}
