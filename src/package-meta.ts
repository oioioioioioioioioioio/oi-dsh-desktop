import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

interface DesktopManifest {
  readonly name: string
  readonly version: string
}

export function packageRoot(): string {
  return fileURLToPath(new URL('..', import.meta.url))
}

export function desktopManifest(): DesktopManifest {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as DesktopManifest
}
