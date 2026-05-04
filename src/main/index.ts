import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import {
  ensureBasicSession,
  ensureCsrfSession,
  getAsset,
  restWithApiKey,
  restWithBasicCsrf,
  restWithCsrf
} from './syncthing-session'

function runningInWsl(): boolean {
  if (process.platform !== 'linux') {
    return false
  }
  if (process.env['WSL_DISTRO_NAME'] || process.env['WSL_INTEROP']) {
    return true
  }
  try {
    return readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')
  } catch {
    return false
  }
}

// Chromium/Electron refuse to run as root without this (typical under WSL or remote root shells).
if (process.platform === 'linux' && typeof process.geteuid === 'function' && process.geteuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox')
}

// WSL / headless GPU often fails to init the GPU process; must be before app.ready.
if (process.env['SYNCWEB_DISABLE_GPU'] === '1' || runningInWsl()) {
  app.disableHardwareAcceleration()
}

const isDev = !!process.env['ELECTRON_RENDERER_URL']

type Connection = {
  baseUrl: string
  apiKey: string
  rejectUnauthorized: boolean
  localSession?: boolean
  guiUser?: string
  guiPassword?: string
}

type RestIpcPayload = {
  baseUrl: string
  apiKey: string
  rejectUnauthorized: boolean
  localSession: boolean
  guiUser?: string
  guiPassword?: string
  method: string
  restPath: string
  query?: Record<string, string>
  body?: unknown
}

type AssetIpcPayload = {
  baseUrl: string
  apiKey: string
  rejectUnauthorized: boolean
  localSession: boolean
  guiUser?: string
  guiPassword?: string
  assetPath: string
  query: Record<string, string>
}

function connectionPath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'connection.json')
}

function readConnection(): Connection | null {
  try {
    const raw = readFileSync(connectionPath(), 'utf8')
    return JSON.parse(raw) as Connection
  } catch {
    return null
  }
}

function writeConnection(c: Connection): void {
  writeFileSync(connectionPath(), JSON.stringify(c, null, 2), 'utf8')
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const conn = readConnection()
  if (conn?.rejectUnauthorized === false) {
    session.defaultSession.setCertificateVerifyProc((_request, callback) => {
      callback(0)
    })
  }

  ipcMain.handle('connection:get', () => readConnection())
  ipcMain.handle('connection:set', (_e, c: Connection) => {
    writeConnection(c)
    return true
  })
  ipcMain.handle('connection:clear', () => {
    try {
      const p = connectionPath()
      if (existsSync(p)) {
        unlinkSync(p)
      }
    } catch {
      /* ignore */
    }
    return true
  })
  ipcMain.handle('shell:openPath', (_e, p: string) => shell.openPath(p))
  ipcMain.handle('shell:showItemInFolder', (_e, p: string) => {
    shell.showItemInFolder(p)
    return true
  })

  ipcMain.handle('syncthing:rest', async (_e, p: RestIpcPayload) => {
    const tls = { rejectUnauthorized: p.rejectUnauthorized !== false }
    try {
      let r
      if (p.apiKey.trim()) {
        r = await restWithApiKey(
          p.baseUrl,
          tls,
          p.apiKey.trim(),
          p.method,
          p.restPath,
          p.query,
          p.body
        )
      } else if (p.guiUser?.trim()) {
        await ensureBasicSession(p.baseUrl, p.guiUser.trim(), p.guiPassword ?? '', tls)
        r = await restWithBasicCsrf(
          p.baseUrl,
          tls,
          p.guiUser.trim(),
          p.method,
          p.restPath,
          p.query,
          p.body
        )
      } else if (p.localSession) {
        r = await restWithCsrf(p.baseUrl, tls, p.method, p.restPath, p.query, p.body)
      } else {
        return { ok: false, statusCode: 0, error: '缺少认证信息（API 密钥、本机会话或 GUI 账户）' }
      }
      const text = r.body.toString('utf8')
      if (r.statusCode === 204) {
        return { ok: true, statusCode: 204 }
      }
      if (r.contentType.includes('application/json')) {
        return {
          ok: r.statusCode >= 200 && r.statusCode < 300,
          statusCode: r.statusCode,
          json: JSON.parse(text) as unknown
        }
      }
      return {
        ok: r.statusCode >= 200 && r.statusCode < 300,
        statusCode: r.statusCode,
        text
      }
    } catch (err) {
      return { ok: false, statusCode: 0, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('syncthing:getAsset', async (_e, p: AssetIpcPayload) => {
    const tls = { rejectUnauthorized: p.rejectUnauthorized !== false }
    try {
      let kind: 'apiKey' | 'csrf' | 'basic'
      if (p.apiKey.trim()) {
        kind = 'apiKey'
      } else if (p.guiUser?.trim()) {
        await ensureBasicSession(p.baseUrl, p.guiUser.trim(), p.guiPassword ?? '', tls)
        kind = 'basic'
      } else if (p.localSession) {
        await ensureCsrfSession(p.baseUrl, tls)
        kind = 'csrf'
      } else {
        return { ok: false, error: '缺少认证信息' }
      }
      const r = await getAsset(
        p.baseUrl,
        tls,
        kind,
        p.apiKey.trim(),
        p.guiUser?.trim() ?? '',
        p.assetPath,
        p.query
      )
      if (r.statusCode !== 200) {
        return {
          ok: false,
          statusCode: r.statusCode,
          error: r.body.toString('utf8').slice(0, 200)
        }
      }
      return {
        ok: true,
        statusCode: 200,
        base64: r.body.toString('base64'),
        contentType: r.contentType
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
