import {
  existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, unlinkSync,
} from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import {
  PROFILE_PATCH_FILENAME,
  boot,
  composeEntries,
  healProfilesModuleFallback,
  loadOptionalPatches,
  loadProfile,
} from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import {
  DSH_LAUNCH_ENVIRONMENT_KEY,
  type LaunchEnvironmentSnapshot,
} from '@deepseek-ai/dsh-launch-environment'
import type { PackageRuntime } from './runtime.js'
import {
  provideDesktopNativeHost,
  type DesktopNativeHost,
} from 'oi-dsh-desktop-bundle'

const NAME = 'oi-dsh-desktop'
const OWNER_FILE = '.oi-dsh-desktop-profile.json'
const ROOT_CONFIG = 'cordis.yml'
const BASE_BUNDLE = '@deepseek-ai/dsh-base'
const WEB_BUNDLE = '@deepseek-ai/dsh-web-app'
const DESKTOP_BUNDLE = 'oi-dsh-desktop-bundle'
const TELEMETRY_ROW = 'session-telemetry-otel'
const EMPTY_ROOT = '# Managed by oi-dsh-desktop. Edit cordis.patch.yml instead.\n[]\n'
const EMPTY_PATCH = '# User overrides for the oi-dsh-desktop profile.\n[]\n'

interface ProfileManifest {
  readonly name?: string
  readonly private?: boolean
  readonly dependencies?: Record<string, string>
  readonly dsh?: { readonly profile?: { readonly bundles?: string[] } }
}

export interface DesktopProfileOptions {
  readonly profile: string
  readonly dshHome?: string
  readonly environment: LaunchEnvironmentSnapshot
  readonly installAnchor: string
  readonly dshRuntime: PackageRuntime
  readonly bundleRuntime: PackageRuntime
  readonly nativeHost: DesktopNativeHost
}

export async function bootDesktopProfile(options: DesktopProfileOptions): Promise<Context> {
  const home = resolveDshHome(options.dshHome)
  const profileDir = join(home, 'profiles', options.profile)
  await prepareManagedProfile(profileDir, options.profile, options.bundleRuntime)
  healProfilesModuleFallback(options.installAnchor, home)
  const profile = loadProfile(NAME, options.profile, options.installAnchor, home)
  await writeFile(join(profile.dir, ROOT_CONFIG), EMPTY_ROOT, 'utf8')

  const homePatchPath = join(home, PROFILE_PATCH_FILENAME)
  const bundlePatches = profile.layers.flatMap(layer => layer.patches)
  const homePatches = loadOptionalPatches(NAME, homePatchPath) ?? []
  const rows = new Map<string, EntryOptions>()
  for (const row of composeEntries([bundlePatches, profile.patches, homePatches])) {
    if (typeof row.id === 'string') rows.set(row.id, row)
  }
  const launcherPatches: PatchOptions[] = []
  const presetRow = rows.get('agent-presets')
  if (presetRow !== undefined) {
    launcherPatches.push({
      id: 'agent-presets',
      config: {
        ...(presetRow.config ?? {}) as Record<string, unknown>,
        roots: [{ path: join(options.dshRuntime.packageDir, 'config', 'agent-presets'), trust: 'system' }],
      },
    })
  }
  if ((process.env.DSH_TELEMETRY_DISABLED ?? '') !== '' && rows.has(TELEMETRY_ROW)) {
    launcherPatches.push({ id: TELEMETRY_ROW, disabled: true })
  }
  const patches = structuredClone([
    ...bundlePatches,
    ...profile.patches,
    ...homePatches,
    ...launcherPatches,
  ])
  let current: Context | undefined
  return boot(NAME, join(profile.dir, ROOT_CONFIG), patches, ctx => {
    current = ctx
    ctx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, options.environment)
    provideDesktopNativeHost(ctx, options.nativeHost)
    provideCmdline(ctx, {
      args: [],
      exit: () => { void current?.fiber.dispose() },
    })
  }, options.installAnchor)
}

async function prepareManagedProfile(
  profileDir: string,
  profile: string,
  bundle: PackageRuntime,
): Promise<void> {
  await mkdir(profileDir, { recursive: true })
  const markerPath = join(profileDir, OWNER_FILE)
  if (existsSync(markerPath)) {
    const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as Record<string, unknown>
    if (marker.owner !== NAME || marker.profile !== profile || marker.schemaVersion !== 1) {
      throw new Error(`invalid oi-dsh-desktop profile marker: ${markerPath}`)
    }
  } else {
    const hasProfile = existsSync(join(profileDir, 'package.json')) || existsSync(join(profileDir, PROFILE_PATCH_FILENAME))
    if (hasProfile) {
      throw new Error(`Harness profile ${JSON.stringify(profile)} already exists and is not managed by oi-dsh-desktop`)
    }
    await writeAtomic(markerPath, `${JSON.stringify({ schemaVersion: 1, owner: NAME, profile }, undefined, 2)}\n`)
  }

  const manifestPath = join(profileDir, 'package.json')
  const current = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8')) as ProfileManifest
    : {}
  const existingBundles = current.dsh?.profile?.bundles ?? []
  const extras = existingBundles.filter(name =>
    name !== BASE_BUNDLE && name !== WEB_BUNDLE && name !== DESKTOP_BUNDLE)
  const manifest: ProfileManifest = {
    ...current,
    name: current.name ?? `dsh-profile-${profile}`,
    private: true,
    dependencies: { ...current.dependencies, [DESKTOP_BUNDLE]: bundle.version },
    dsh: {
      ...current.dsh,
      profile: {
        ...current.dsh?.profile,
        bundles: [BASE_BUNDLE, WEB_BUNDLE, ...extras, DESKTOP_BUNDLE],
      },
    },
  }
  await writeAtomic(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)
  const patchPath = join(profileDir, PROFILE_PATCH_FILENAME)
  if (!existsSync(patchPath)) await writeFile(patchPath, EMPTY_PATCH, 'utf8')
  ensurePackageLink(join(profileDir, 'node_modules', DESKTOP_BUNDLE), bundle.packageDir)
}

function ensurePackageLink(link: string, target: string): void {
  mkdirSync(dirname(link), { recursive: true })
  if (existsSync(link) || isDanglingLink(link)) {
    const stat = lstatSync(link)
    if (!stat.isSymbolicLink()) {
      throw new Error(`managed profile package path is not a link: ${link}`)
    }
    const current = resolve(dirname(link), readlinkSync(link))
    if (current === resolve(target)) return
    unlinkSync(link)
  }
  symlinkSync(resolve(target), link, process.platform === 'win32' ? 'junction' : 'dir')
}

function isDanglingLink(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ENOENT'
  }
}

async function writeAtomic(path: string, content: string): Promise<void> {
  const temporary = `${path}.${String(process.pid)}.tmp`
  await writeFile(temporary, content, 'utf8')
  await rename(temporary, path)
}
