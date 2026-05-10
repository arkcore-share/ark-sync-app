/**
 * Ark Sync 引擎 REST without API key (no GUI password): requires CSRF cookie + header.
 * Node bypasses browser CORS; bootstrap with GET / then send Cookie + X-CSRF-Token-*.
 */

import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'

export type SessionOpts = {
  rejectUnauthorized: boolean
}

type CsrfSession = {
  cookieHeader: string
  csrfHeader: string
  csrfValue: string
}

const sessions = new Map<string, CsrfSession>()

type BasicSession = {
  authorization: string
  cookieHeader: string
  csrfHeader: string
  csrfValue: string
}

const basicSessions = new Map<string, BasicSession>()

function sessionKey(baseUrl: string): string {
  return new URL(baseUrl.trim().replace(/\/$/, '')).origin
}

function basicKey(baseUrl: string, user: string): string {
  return `${sessionKey(baseUrl)}|${user}`
}

function mergeSetCookie(existing: string, setCookie: string | string[] | undefined): string {
  const jars = new Map<string, string>()
  if (existing) {
    for (const part of existing.split(';')) {
      const t = part.trim()
      if (!t) {
        continue
      }
      const eq = t.indexOf('=')
      if (eq > 0) {
        jars.set(t.slice(0, eq), t.slice(eq + 1))
      }
    }
  }
  for (const line of Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []) {
    const first = line.split(';')[0].trim()
    const eq = first.indexOf('=')
    if (eq > 0) {
      jars.set(first.slice(0, eq), first.slice(eq + 1))
    }
  }
  return Array.from(jars.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

function extractCsrfSession(cookieHeader: string): CsrfSession | null {
  for (const part of cookieHeader.split(';')) {
    const t = part.trim()
    const m = /^CSRF-Token-([^=]+)=(.+)$/.exec(t)
    if (m) {
      const shortId = m[1]
      const value = m[2]
      return {
        cookieHeader: `CSRF-Token-${shortId}=${value}`,
        csrfHeader: `X-CSRF-Token-${shortId}`,
        csrfValue: value
      }
    }
  }
  return null
}

function requestOnce(
  method: string,
  urlStr: string,
  headers: Record<string, string>,
  body: Buffer | null,
  opts: SessionOpts
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const isHttps = u.protocol === 'https:'
    const lib = isHttps ? https : http
    const reqHeaders: http.OutgoingHttpHeaders = { ...headers, Host: u.host }
    const reqOpts: https.RequestOptions = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method,
      headers: reqHeaders,
      agent: isHttps
        ? new https.Agent({ rejectUnauthorized: opts.rejectUnauthorized !== false })
        : undefined
    }
    const req = lib.request(reqOpts, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c as Buffer))
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: Buffer.concat(chunks)
        })
      })
    })
    req.on('error', reject)
    if (body) {
      req.write(body)
    }
    req.end()
  })
}

async function followGet(
  startUrl: string,
  opts: SessionOpts,
  extraHeaders: Record<string, string> = {}
): Promise<{ statusCode: number; finalCookie: string }> {
  let url = startUrl
  let cookie = ''
  for (let i = 0; i < 8; i++) {
    const h: Record<string, string> = { ...extraHeaders }
    if (cookie) {
      h.Cookie = cookie
    }
    const res = await requestOnce('GET', url, h, null, opts)
    if (res.headers['set-cookie']) {
      cookie = mergeSetCookie(cookie, res.headers['set-cookie'])
    }
    const code = res.statusCode
    if ((code === 301 || code === 302 || code === 303 || code === 307 || code === 308) && res.headers.location) {
      url = new URL(res.headers.location, url).href
      continue
    }
    return { statusCode: code, finalCookie: cookie }
  }
  throw new Error('too many redirects while bootstrapping CSRF')
}

export async function ensureCsrfSession(baseUrl: string, opts: SessionOpts): Promise<void> {
  const key = sessionKey(baseUrl)
  if (sessions.has(key)) {
    return
  }
  const origin = key
  const { finalCookie } = await followGet(`${origin}/`, opts, {})
  const extracted = extractCsrfSession(finalCookie)
  if (!extracted) {
    throw new Error(
      '未能获取 CSRF Cookie。请确认未设置 GUI 密码；若已设置 API 密钥请改用密钥连接。'
    )
  }
  sessions.set(key, extracted)
}

export function clearCsrfSession(baseUrl: string): void {
  sessions.delete(sessionKey(baseUrl))
}

export async function restWithCsrf(
  baseUrl: string,
  opts: SessionOpts,
  method: string,
  restPath: string,
  query: Record<string, string> | undefined,
  body: unknown | undefined
): Promise<{ statusCode: number; body: Buffer; contentType: string }> {
  const key = sessionKey(baseUrl)
  let sess = sessions.get(key)
  if (!sess) {
    await ensureCsrfSession(baseUrl, opts)
    sess = sessions.get(key)!
  }

  const u = new URL(baseUrl.trim().replace(/\/$/, ''))
  const q = query ? new URLSearchParams(query as Record<string, string>).toString() : ''
  const pathWithQuery = `/rest${restPath.startsWith('/') ? restPath : '/' + restPath}${q ? `?${q}` : ''}`
  const url = `${u.origin}${pathWithQuery}`

  const headers: Record<string, string> = {
    Cookie: sess.cookieHeader,
    [sess.csrfHeader]: sess.csrfValue
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const buf = body !== undefined ? Buffer.from(JSON.stringify(body), 'utf8') : null
  let res = await requestOnce(method, url, headers, buf, opts)

  if (res.statusCode === 403 && res.body.toString().includes('CSRF')) {
    clearCsrfSession(baseUrl)
    await ensureCsrfSession(baseUrl, opts)
    sess = sessions.get(key)!
    headers.Cookie = sess.cookieHeader
    headers[sess.csrfHeader] = sess.csrfValue
    res = await requestOnce(method, url, headers, buf, opts)
  }

  const ct = (res.headers['content-type'] as string) || ''
  return { statusCode: res.statusCode, body: res.body, contentType: ct }
}

export async function ensureBasicSession(
  baseUrl: string,
  user: string,
  password: string,
  opts: SessionOpts
): Promise<void> {
  const key = basicKey(baseUrl, user)
  if (basicSessions.has(key)) {
    return
  }
  const origin = sessionKey(baseUrl)
  const authorization =
    'Basic ' + Buffer.from(`${user}:${password}`, 'utf8').toString('base64')
  const { finalCookie } = await followGet(`${origin}/`, opts, { Authorization: authorization })
  const extracted = extractCsrfSession(finalCookie)
  if (!extracted) {
    throw new Error('GUI 登录后未能获取 CSRF，请检查用户名/密码或改用 API 密钥。')
  }
  basicSessions.set(key, {
    authorization,
    cookieHeader: finalCookie,
    csrfHeader: extracted.csrfHeader,
    csrfValue: extracted.csrfValue
  })
}

export function clearBasicSession(baseUrl: string, user: string): void {
  basicSessions.delete(basicKey(baseUrl, user))
}

export async function restWithBasicCsrf(
  baseUrl: string,
  opts: SessionOpts,
  user: string,
  method: string,
  restPath: string,
  query: Record<string, string> | undefined,
  body: unknown | undefined
): Promise<{ statusCode: number; body: Buffer; contentType: string }> {
  const key = basicKey(baseUrl, user)
  let sess = basicSessions.get(key)
  if (!sess) {
    throw new Error('Basic 会话未初始化')
  }

  const u = new URL(baseUrl.trim().replace(/\/$/, ''))
  const q = query ? new URLSearchParams(query as Record<string, string>).toString() : ''
  const pathWithQuery = `/rest${restPath.startsWith('/') ? restPath : '/' + restPath}${q ? `?${q}` : ''}`
  const url = `${u.origin}${pathWithQuery}`

  const headers: Record<string, string> = {
    Authorization: sess.authorization,
    Cookie: sess.cookieHeader,
    [sess.csrfHeader]: sess.csrfValue
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  const buf = body !== undefined ? Buffer.from(JSON.stringify(body), 'utf8') : null
  let res = await requestOnce(method, url, headers, buf, opts)

  if (res.statusCode === 403 && res.body.toString().includes('CSRF')) {
    basicSessions.delete(key)
    throw new Error('CSRF 失效，请重新连接')
  }

  const ct = (res.headers['content-type'] as string) || ''
  return { statusCode: res.statusCode, body: res.body, contentType: ct }
}

/** GET 非 /rest 路径（如 /qr/），使用与 REST 相同的认证方式 */
export async function getAsset(
  baseUrl: string,
  opts: SessionOpts,
  kind: 'apiKey' | 'csrf' | 'basic',
  apiKey: string,
  guiUser: string,
  assetPath: string,
  query: Record<string, string>
): Promise<{ statusCode: number; body: Buffer; contentType: string }> {
  const u = new URL(baseUrl.trim().replace(/\/$/, ''))
  const qs = new URLSearchParams(query).toString()
  const url = `${u.origin}${assetPath.startsWith('/') ? assetPath : '/' + assetPath}${qs ? `?${qs}` : ''}`

  const headers: Record<string, string> = {}
  if (kind === 'apiKey') {
    headers['X-API-Key'] = apiKey
  } else if (kind === 'csrf') {
    const sk = sessionKey(baseUrl)
    const sess = sessions.get(sk)
    if (!sess) {
      throw new Error('无 CSRF 会话')
    }
    headers.Cookie = sess.cookieHeader
    headers[sess.csrfHeader] = sess.csrfValue
  } else {
    const sess = basicSessions.get(basicKey(baseUrl, guiUser))
    if (!sess) {
      throw new Error('无 Basic 会话')
    }
    headers.Authorization = sess.authorization
    headers.Cookie = sess.cookieHeader
    headers[sess.csrfHeader] = sess.csrfValue
  }

  const res = await requestOnce('GET', url, headers, null, opts)
  const ct = (res.headers['content-type'] as string) || ''
  return { statusCode: res.statusCode, body: res.body, contentType: ct }
}

export async function restWithApiKey(
  baseUrl: string,
  opts: SessionOpts,
  apiKey: string,
  method: string,
  restPath: string,
  query: Record<string, string> | undefined,
  body: unknown | undefined
): Promise<{ statusCode: number; body: Buffer; contentType: string }> {
  const u = new URL(baseUrl.trim().replace(/\/$/, ''))
  const q = query ? new URLSearchParams(query as Record<string, string>).toString() : ''
  const pathWithQuery = `/rest${restPath.startsWith('/') ? restPath : '/' + restPath}${q ? `?${q}` : ''}`
  const url = `${u.origin}${pathWithQuery}`

  const headers: Record<string, string> = {
    'X-API-Key': apiKey
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  const buf = body !== undefined ? Buffer.from(JSON.stringify(body), 'utf8') : null
  const res = await requestOnce(method, url, headers, buf, opts)
  const ct = (res.headers['content-type'] as string) || ''
  return { statusCode: res.statusCode, body: res.body, contentType: ct }
}
