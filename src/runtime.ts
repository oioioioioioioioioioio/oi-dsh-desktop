import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

interface PackageManifest {
  readonly name?: string
  readonly version?: string
}

export interface PackageRuntime {
  readonly version: string
  readonly packageDir: string
  readonly manifestPath: string
}

export function resolvePackageRuntime(name: '@deepseek-ai/dsh' | 'oi-dsh-desktop-bundle'): PackageRuntime {
  let manifestPath: string
  try {
    manifestPath = createRequire(import.meta.url).resolve(`${name}/package.json`)
  } catch {
    throw new Error(`${name} is not installed beside oi-dsh-desktop`)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest
  if (manifest.name !== name || typeof manifest.version !== 'string') {
    throw new Error(`invalid package manifest for ${name}: ${manifestPath}`)
  }
  return { manifestPath, packageDir: dirname(manifestPath), version: manifest.version }
}

export function assertCompatibleHarness(version: string, allowUnsupported: boolean): void {
  if (allowUnsupported) return
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?(?:\+.*)?$/.exec(version)
  const compatible = match !== null
    && Number(match[1]) === 0
    && Number(match[2]) === 1
    && (Number(match[3]) > 0 || match[4] === undefined || Number(match[4]) >= 6)
  if (!compatible) {
    throw new Error(
      `DeepSeek Harness ${version} is unsupported; oi-dsh-desktop requires 0.1.0-rc.6 through 0.1.x`,
    )
  }
}
