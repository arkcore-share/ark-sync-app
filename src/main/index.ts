import { spawnSync } from 'node:child_process'
import { app, BrowserWindow, ipcMain, Menu, nativeTheme, session, shell } from 'electron'
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

function trySpawn(file: string, args: string[]): boolean {
  try {
    const r = spawnSync(file, args, {
      stdio: 'ignore',
      encoding: 'utf8',
      shell: false,
      windowsHide: true
    })
    return r.status === 0
  } catch {
    return false
  }
}

/** 无桌面/无 xdg-open 的 Linux 或最小 WSL 环境 */
function openHttpUrlLinuxFallback(url: string): boolean {
  for (const [cmd, args] of [
    ['xdg-open', [url]],
    ['gio', ['open', url]]
  ] as const) {
    if (trySpawn(cmd, [...args])) {
      return true
    }
  }
  return false
}

/**
 * WSL 下 Electron 的 openExternal 常走 xdg-open，但发行版里往往未安装，导致 execvp 失败且无浏览器弹出。
 * 优先用 Windows 宿主的默认浏览器打开。
 */
function openHttpUrlFromWsl(url: string): boolean {
  if (trySpawn('wslview', [url])) {
    return true
  }
  if (trySpawn('wslview.exe', [url])) {
    return true
  }
  const cmd = '/mnt/c/Windows/System32/cmd.exe'
  if (existsSync(cmd) && trySpawn(cmd, ['/c', 'start', '', url])) {
    return true
  }
  const explorer = '/mnt/c/Windows/explorer.exe'
  if (existsSync(explorer) && trySpawn(explorer, [url])) {
    return true
  }
  return false
}

async function openExternalUrlMain(url: string): Promise<boolean> {
  const trimmed = url.trim()
  try {
    const u = new URL(trimmed)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return false
    }
  } catch {
    return false
  }

  if (process.platform === 'linux' && runningInWsl()) {
    if (openHttpUrlFromWsl(trimmed)) {
      return true
    }
    if (openHttpUrlLinuxFallback(trimmed)) {
      return true
    }
    /* 不再调用 shell.openExternal：在 WSL 里它几乎总走 xdg-open，易 execvp 失败且仍 resolve，刷屏日志 */
    return false
  }

  try {
    await shell.openExternal(trimmed)
    return true
  } catch {
    if (process.platform === 'linux') {
      return openHttpUrlLinuxFallback(trimmed)
    }
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

/** 与 renderer 深色界面一致 */
const WINDOW_BG_DARK = '#0f1419'
const WINDOW_BG_LIGHT = '#ececec'

function applyWindowsWindowChrome(win: BrowserWindow): void {
  try {
    win.setBackgroundMaterial('auto')
  } catch {
    try {
      win.setBackgroundMaterial('mica')
    } catch {
      /* ignore */
    }
  }
}

function createWindow(): void {
  const isMac = process.platform === 'darwin'
  const isWin = process.platform === 'win32'

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? WINDOW_BG_DARK : WINDOW_BG_LIGHT,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 14, y: 14 }
        }
      : isWin
        ? {
            frame: false,
            /**
             * 默认 thickFrame=true 会给无边框窗加上 WS_THICKFRAME「标准外框」，易出现浅色一圈；
             * 关掉后贴近 Discord / VS Code 一类无边框体验（阴影会变弱，属系统行为）。
             */
            thickFrame: false,
            autoHideMenuBar: true,
            /**
             * Win11：随系统主题选择 Mica/云母等；Win10 会忽略。
             * 标题栏按钮由渲染层自绘（见 WinTitleBar），避免部分环境下 titleBarOverlay 表现为整条浅色「系统栏」。
             */
            backgroundMaterial: 'auto'
          }
        : {
            /** Linux：部分 GTK 主题下尽量请求深色标题栏 */
            darkTheme: true
          }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false
    }
  })

  if (isWin) {
    win.setTitle('Ark Sync')
    win.removeMenu()
    win.webContents.once('did-finish-load', () => {
      if (!win.isDestroyed()) {
        applyWindowsWindowChrome(win)
      }
    })
  }

  win.once('ready-to-show', () => {
    if (isWin) {
      applyWindowsWindowChrome(win)
    }
    win.show()
  })

  if (isWin) {
    const emitMax = (): void => {
      if (win.isDestroyed()) {
        return
      }
      win.webContents.send('window:maximized', win.isMaximized())
    }
    win.on('maximize', emitMax)
    win.on('unmaximize', emitMax)
  }

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  /** 必须为 system，否则无法随 Windows 设置 → 个性化 → 颜色 / 明暗 切换 */
  nativeTheme.themeSource = 'system'

  // Windows / Linux：去掉窗口顶部默认菜单栏（File / Edit / View …）
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }

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
  ipcMain.handle('shell:openExternal', async (_e, url: string) => openExternalUrlMain(url))

  ipcMain.handle('window:minimize', () => {
    const w = BrowserWindow.getFocusedWindow()
    w?.minimize()
  })
  ipcMain.handle('window:maximizeToggle', () => {
    const w = BrowserWindow.getFocusedWindow()
    if (!w || w.isDestroyed()) {
      return false
    }
    if (w.isMaximized()) {
      w.unmaximize()
    } else {
      w.maximize()
    }
    return w.isMaximized()
  })
  ipcMain.handle('window:close', () => {
    BrowserWindow.getFocusedWindow()?.close()
  })
  ipcMain.handle('window:isMaximized', () => BrowserWindow.getFocusedWindow()?.isMaximized() ?? false)

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
      if (r.statusCode === 204) {
        return { ok: true, statusCode: 204 }
      }
      const ct = (r.contentType || '').toLowerCase()
      if (ct.includes('application/json')) {
        const text = r.body.toString('utf8')
        return {
          ok: r.statusCode >= 200 && r.statusCode < 300,
          statusCode: r.statusCode,
          json: JSON.parse(text) as unknown
        }
      }
      if (
        ct.includes('application/zip') ||
        ct.includes('application/octet-stream') ||
        ct.includes('gzip')
      ) {
        return {
          ok: r.statusCode >= 200 && r.statusCode < 300,
          statusCode: r.statusCode,
          base64: r.body.toString('base64'),
          contentType: r.contentType || 'application/octet-stream'
        }
      }
      const text = r.body.toString('utf8')
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

  if (process.platform === 'win32') {
    nativeTheme.on('updated', () => {
      for (const w of BrowserWindow.getAllWindows()) {
        if (w.isDestroyed()) {
          continue
        }
        applyWindowsWindowChrome(w)
      }
    })
  }

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
