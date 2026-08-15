import { readFile } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { DesktopClientModuleRegistry } from 'oi-dsh-desktop-bundle'

export const DESKTOP_APP_URL = 'dsh://app/'

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.json': 'application/json',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ')

export interface DesktopProtocolOptions {
  readonly distIndex: string
  readonly assetsDir: string
  readonly clientModules: Pick<DesktopClientModuleRegistry, 'clientPath' | 'graph'>
}

export function createDesktopProtocolHandler(
  options: DesktopProtocolOptions,
): (request: Request) => Promise<Response> {
  const distRoot = resolve(options.distIndex, '..')
  return async request => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } })
    }
    const url = new URL(request.url)
    if (!isAppUrl(url)) return new Response('not found', { status: 404 })
    let pathname: string
    try {
      pathname = decodeURIComponent(url.pathname)
    } catch {
      return new Response('bad path', { status: 400 })
    }
    if (pathname === '/__oi/boot.js') {
      const json = JSON.stringify(options.clientModules.graph()).replaceAll('<', '\\u003c')
      return textResponse(`window.__DSH_BOOT__ = ${json};\n`, 'text/javascript; charset=utf-8', request.method)
    }
    if (pathname === '/__oi/chrome.js') {
      return fileResponse(resolve(options.assetsDir, 'desktop-chrome.js'), request.method, false)
    }
    if (pathname === '/__oi/chrome.css') {
      return fileResponse(resolve(options.assetsDir, 'desktop-chrome.css'), request.method, false)
    }
    if (pathname === '/logo.jpg') {
      return fileResponse(resolve(options.assetsDir, 'logo.jpg'), request.method, false)
    }
    if (pathname.startsWith('/plugins/')) {
      const plugin = pluginPath(pathname, options.clientModules)
      if (plugin === undefined) return new Response('not found', { status: 404 })
      return fileResponse(plugin, request.method, false).catch(error => {
        if (isMissing(error)) return new Response('not found', { status: 404 })
        throw error
      })
    }
    const target = pathname === '/' ? options.distIndex : resolve(distRoot, `.${pathname}`)
    if (!inside(distRoot, target)) return new Response('forbidden', { status: 403 })
    try {
      return await fileResponse(target, request.method, target === options.distIndex)
    } catch (error) {
      if (!isMissing(error)) throw error
      if (extname(pathname) !== '') return new Response('not found', { status: 404 })
      return fileResponse(options.distIndex, request.method, true)
    }
  }
}

export function isDesktopAppUrl(raw: string): boolean {
  try {
    return isAppUrl(new URL(raw))
  } catch {
    return false
  }
}

function isAppUrl(url: URL): boolean {
  return url.protocol === 'dsh:' && url.hostname === 'app'
    && url.username === '' && url.password === '' && url.port === ''
}

function pluginPath(
  pathname: string,
  modules: Pick<DesktopClientModuleRegistry, 'clientPath'>,
): string | undefined {
  const prefix = '/plugins/'
  const mapSuffix = '/client.js.map'
  const bundleSuffix = '/client.js'
  const sourceMap = pathname.endsWith(mapSuffix)
  const suffix = sourceMap ? mapSuffix : bundleSuffix
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) return undefined
  const id = pathname.slice(prefix.length, -suffix.length)
  const path = modules.clientPath(id)
  return path === undefined ? undefined : sourceMap ? `${path}.map` : path
}

async function fileResponse(path: string, method: string, index: boolean): Promise<Response> {
  const body = await readFile(path)
  const headers: Record<string, string> = {
    'content-type': MIME[extname(path)] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
  }
  let responseBody: BodyInit | null = body
  if (index) {
    const html = body.toString('utf8')
    responseBody = injectDesktopBoot(html)
    headers['content-security-policy'] = CSP
  }
  return new Response(method === 'HEAD' ? null : responseBody, { status: 200, headers })
}

function textResponse(body: string, contentType: string, method: string): Response {
  return new Response(method === 'HEAD' ? null : body, {
    status: 200,
    headers: { 'content-type': contentType, 'cache-control': 'no-cache, no-store' },
  })
}

export function injectDesktopBoot(html: string): string {
  const injection = [
    '<script src="/__oi/boot.js"></script>',
    '<link rel="stylesheet" href="/__oi/chrome.css">',
    '<script defer src="/__oi/chrome.js"></script>',
  ].join('')
  const head = html.indexOf('<head>')
  return head === -1 ? `${injection}${html}` : `${html.slice(0, head + 6)}${injection}${html.slice(head + 6)}`
}

function inside(root: string, target: string): boolean {
  const path = relative(root, target)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return code === 'ENOENT' || code === 'EISDIR'
}
