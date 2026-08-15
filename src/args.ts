import { resolve } from 'node:path'

export interface DesktopOptions {
  readonly profile: string
  readonly dshHome?: string
  readonly devtools: boolean
  readonly allowUnsupportedHarness: boolean
  readonly help: boolean
  readonly version: boolean
}

const DEFAULT_PROFILE = 'oi-desktop'

export function parseDesktopArgs(argv: readonly string[]): DesktopOptions {
  let profile = DEFAULT_PROFILE
  let dshHome: string | undefined
  let devtools = false
  let allowUnsupportedHarness = false
  let help = false
  let version = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === undefined) break
    switch (argument) {
      case '--profile':
        profile = valueAfter(argv, index, argument)
        index += 1
        break
      case '--dsh-home':
        dshHome = resolve(valueAfter(argv, index, argument))
        index += 1
        break
      case '--devtools':
        devtools = true
        break
      case '--allow-unsupported-harness':
        allowUnsupportedHarness = true
        break
      case '-h':
      case '--help':
        help = true
        break
      case '-V':
      case '--version':
        version = true
        break
      default:
        throw new Error(`unknown option ${JSON.stringify(argument)}`)
    }
  }
  if (profile === '' || profile === '.' || profile === '..' || profile === 'node_modules'
    || profile.includes('/') || profile.includes('\\')) {
    throw new Error(`invalid Harness profile name ${JSON.stringify(profile)}`)
  }
  return {
    profile,
    ...(dshHome === undefined ? {} : { dshHome }),
    devtools,
    allowUnsupportedHarness,
    help,
    version,
  }
}

function valueAfter(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]
  if (value === undefined || value === '' || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`)
  }
  return value
}

export function desktopHelp(): string {
  return [
    'Usage: oi-dsh-desktop [options]',
    '',
    'Options:',
    '  --profile <name>                 managed Harness profile (default: oi-desktop)',
    '  --dsh-home <path>                override DSH_HOME for this launch',
    '  --devtools                       open Electron developer tools',
    '  --allow-unsupported-harness      bypass the Harness compatibility guard',
    '  -V, --version                    print the desktop package version',
    '  -h, --help                       print this help',
  ].join('\n')
}
