import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const desktopDir = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))

describe('published package boundary', () => {
  it('installs the Harness bundle from its independent GitHub repository', async () => {
    const desktop = JSON.parse(await readFile(join(desktopDir, 'package.json'), 'utf8')) as PackageManifest
    const require = createRequire(import.meta.url)
    const bundlePath = require.resolve('oi-dsh-desktop-bundle/package.json')
    const bundle = JSON.parse(await readFile(bundlePath, 'utf8')) as PackageManifest

    expect(desktop.name).toBe('oi-dsh-desktop')
    expect(desktop.dependencies?.['oi-dsh-desktop-bundle']).toBe(
      'https://codeload.github.com/oioioioioioioioioioio/oi-dsh-desktop-bundle/tar.gz/refs/tags/v0.2.1',
    )
    expect(bundle.name).toBe('oi-dsh-desktop-bundle')
    expect(bundle.version).toBe('0.2.1')
    expect(bundle.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(bundle.files).toContain('harness.patch')
    expect(bundle.files).toContain('legacy')
    expect(bundle.exports).toHaveProperty('./harness-extension')
    expect(desktop.files).not.toContain('node_modules')
  })
})

interface PackageManifest {
  readonly name?: string
  readonly version?: string
  readonly files?: string[]
  readonly exports?: Record<string, unknown>
  readonly dependencies?: Record<string, string>
  readonly dsh?: { readonly bundle?: { readonly patch?: string } }
}
