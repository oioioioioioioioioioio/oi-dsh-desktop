import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { packagedDesktopPath, resolveHarnessRoot } from '../src/installer.js'

describe('Harness source installer paths', () => {
  it('uses the parent directory when oi-dsh-desktop is installed inside Harness', async () => {
    const root = await mkdtemp(join(tmpdir(), 'oi-dsh-harness-'))
    const desktop = join(root, 'oi-dsh-desktop')
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-root' }), 'utf8')

    expect(resolveHarnessRoot(undefined, desktop)).toBe(root)
    expect(packagedDesktopPath(root)).toBe(
      join(root, 'dist', 'oi-dsh-desktop-win32-x64', 'oi-dsh-desktop.exe'),
    )
  })

  it('rejects a directory that is not a Harness source checkout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'oi-dsh-not-harness-'))
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'other-project' }), 'utf8')

    expect(() => resolveHarnessRoot(root)).toThrow('not a DeepSeek Harness source root')
  })
})
