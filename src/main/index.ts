import { spawn, spawnSync } from 'node:child_process'
import { app, BrowserWindow, ipcMain, Menu, nativeImage, nativeTheme, session, shell, Tray } from 'electron'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import {
  ensureBasicSession,
  ensureCsrfSession,
  getAsset,
  restWithApiKey,
  restWithBasicCsrf,
  restWithCsrf
} from './syncthing-session'
import { startBundledSyncthingIfPresent, stopBundledSyncthing } from './bundledSyncthing'
import { buildTrayContextMenu } from './tray-menu'
import { listAgentArtifactsDetails } from './agentArtifactsScan'
import { exportAgentArtifactsToSyncTmp } from './agentArtifactsExport.js'
import { rollbackAgentConfigSync, scanSyncRelayContent, syncAgentConfigs, syncAgentConfigsWithRelay } from './agentConfigSync.js'
import { invalidateThirdPartyScanCache, scanThirdPartyProducts } from './thirdPartyScan'
import {
  getSecurityRulesPaths,
  getSecurityRulesSyncStatus,
  setSecurityRulesSyncStatusBroadcaster,
  startSecurityRulesSyncOnLaunch
} from './securityRulesSync.js'
import { scanSkillsSecurity } from './skillsSecurityScan.js'
import { runThirdPartyInstallScript } from './thirdPartyInstall'
import type { TrayCommand } from '../shared/trayCommand.js'

/** 主窗口引用（托盘「显示」、关闭到托盘） */
let mainWindow: BrowserWindow | null = null
let appTray: Tray | null = null
/** 为 true 时允许窗口真正关闭（退出应用） */
let isAppQuitting = false
/** 托盘菜单当前语言（用于主进程内本地化） */
let trayLocale = 'zh-CN'

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

/**
 * electron-vite 开发时靠 ELECTRON_RENDERER_URL 走 loadURL；relaunch 子进程常丢该 env。
 * Windows 上自定义 argv 也可能传丢，故在重启前把 URL 写入临时文件，下次启动时恢复。
 */
const SYNCWEB_RENDERER_URL_ARG = '--syncweb-renderer-url='
const SYNCWEB_DEV_RENDERER_URL_FILE = join(tmpdir(), 'sync-web-ark-dev-renderer-url.txt')
/** 仅接受近期写入的 sidecar，避免很久以前开发留下的文件误伤 preview / 未打包运行 */
const SYNCWEB_DEV_RENDERER_URL_MAX_AGE_MS = 30 * 60 * 1000

function applySyncWebDevRendererUrlFromArgv(): void {
  for (const a of process.argv) {
    if (a.startsWith(SYNCWEB_RENDERER_URL_ARG)) {
      const raw = a.slice(SYNCWEB_RENDERER_URL_ARG.length)
      try {
        process.env['ELECTRON_RENDERER_URL'] = decodeURIComponent(raw)
      } catch {
        process.env['ELECTRON_RENDERER_URL'] = raw
      }
      return
    }
  }
}

function applySyncWebDevRendererUrlFromSidecar(): void {
  if (process.env['ELECTRON_RENDERER_URL']?.trim()) {
    return
  }
  /** 与 !app.isPackaged 接近；部分环境下仅用 isPackaged 会误判，放宽以免读不到 sidecar */
  const allowSidecar = process.defaultApp === true || !app.isPackaged
  if (!allowSidecar) {
    return
  }
  try {
    if (!existsSync(SYNCWEB_DEV_RENDERER_URL_FILE)) {
      return
    }
    const raw = readFileSync(SYNCWEB_DEV_RENDERER_URL_FILE, 'utf8').trim()
    unlinkSync(SYNCWEB_DEV_RENDERER_URL_FILE)
    let url: string | null = null
    try {
      const o = JSON.parse(raw) as { url?: string; t?: number }
      if (
        typeof o.url === 'string' &&
        /^https?:\/\//i.test(o.url) &&
        typeof o.t === 'number' &&
        Date.now() - o.t <= SYNCWEB_DEV_RENDERER_URL_MAX_AGE_MS
      ) {
        url = o.url
      }
    } catch {
      if (/^https?:\/\//i.test(raw)) {
        url = raw
      }
    }
    if (url) {
      process.env['ELECTRON_RENDERER_URL'] = url
    }
  } catch {
    /* ignore */
  }
}

applySyncWebDevRendererUrlFromArgv()
applySyncWebDevRendererUrlFromSidecar()

/**
 * 开发入口 URL：env → userData 持久化（上次 did-finish-load 的真实地址）→ electron-vite 兜底端口。
 * 控制台 `npm run dev` 重启子进程时 env 常丢，持久化最稳。
 */
function getDevRendererUrl(): string | null {
  const fromEnv = process.env['ELECTRON_RENDERER_URL']?.trim()
  if (fromEnv) {
    return fromEnv
  }
  const persisted = readPersistedDevRendererUrlFromUserData()
  if (persisted) {
    return persisted
  }
  if (process.env['NODE_ENV_ELECTRON_VITE'] === 'development') {
    return 'http://127.0.0.1:5173/'
  }
  return null
}

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

/** 仅开发：上次成功打开的 Vite 地址（控制台重启后 env 常丢，用此恢复真实端口/路径） */
const SYNCWEB_DEV_RENDERER_PERSIST = 'sync-web-dev-renderer-origin.json'
const SYNCWEB_DEV_RENDERER_PERSIST_MAX_MS = 7 * 24 * 60 * 60 * 1000

function devPersistedRendererPath(): string {
  return join(app.getPath('userData'), SYNCWEB_DEV_RENDERER_PERSIST)
}

function readPersistedDevRendererUrlFromUserData(): string | null {
  if (app.isPackaged) {
    return null
  }
  try {
    const p = devPersistedRendererPath()
    if (!existsSync(p)) {
      return null
    }
    const raw = readFileSync(p, 'utf8').trim()
    const o = JSON.parse(raw) as { url?: string; t?: number }
    if (typeof o.url !== 'string' || typeof o.t !== 'number') {
      return null
    }
    if (Date.now() - o.t > SYNCWEB_DEV_RENDERER_PERSIST_MAX_MS) {
      return null
    }
    const u = o.url.trim()
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(u)) {
      return null
    }
    return u
  } catch {
    return null
  }
}

function writePersistedDevRendererUrlToUserData(url: string): void {
  if (app.isPackaged) {
    return
  }
  const u = url.trim()
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(u)) {
    return
  }
  try {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(devPersistedRendererPath(), JSON.stringify({ url: u, t: Date.now() }), 'utf8')
  } catch {
    /* ignore */
  }
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

function trayIconImage(): Electron.NativeImage {
  const trayPath = join(__dirname, '../renderer/tray-icon.png')
  const fallbackPath = join(__dirname, '../renderer/logo.png')
  const logoPath = existsSync(trayPath) ? trayPath : fallbackPath
  const source = nativeImage.createFromPath(logoPath)
  if (source.isEmpty()) {
    console.warn('[sync-web] tray: 图标未加载，路径', logoPath)
    return nativeImage.createEmpty()
  }
  const { width: iw, height: ih } = source.getSize()
  if (iw <= 0 || ih <= 0) {
    return source
  }

  const isDarwin = process.platform === 'darwin'
  /**
   * Windows 托盘宜用 16/32 逻辑像素；过小易糊，故 1x=32 并加 @2x=64，减少高分屏发虚/锯齿。
   * 近方形图（如专用 tray-icon）直接等比缩到边长，避免多余 crop 导致切边或发灰。
   * 扁长图仍用 cover+居中裁剪，避免任务栏里只剩一条细线。
   */
  const edge1x = isDarwin ? 22 : 32
  const edge2x = edge1x * 2

  const toTraySquare = (edge: number): Electron.NativeImage => {
    const ratio = iw / ih
    const nearlySquare = ratio >= 0.9 && ratio <= 1.11
    if (nearlySquare) {
      return source.resize({ width: edge, height: edge, quality: 'best' })
    }
    const scale = Math.max(edge / iw, edge / ih)
    const w = Math.max(1, Math.round(iw * scale))
    const h = Math.max(1, Math.round(ih * scale))
    const scaled = source.resize({ width: w, height: h, quality: 'best' })
    const x = Math.max(0, Math.floor((w - edge) / 2))
    const y = Math.max(0, Math.floor((h - edge) / 2))
    return scaled.crop({ x, y, width: Math.min(edge, w), height: Math.min(edge, h) })
  }

  const oneX = toTraySquare(edge1x)
  if (!isDarwin && typeof oneX.addRepresentation === 'function') {
    try {
      const twoX = toTraySquare(edge2x)
      const buf = twoX.toPNG()
      if (buf.length > 0) {
        oneX.addRepresentation({
          scaleFactor: 2,
          width: edge2x,
          height: edge2x,
          buffer: buf
        })
      }
    } catch {
      /* 部分环境不支持 addRepresentation，仅用 1x */
    }
  }
  return oneX
}

function showOrRestoreMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
}

function sendTrayCommand(cmd: TrayCommand): void {
  const w = mainWindow
  if (!w || w.isDestroyed()) {
    return
  }
  w.webContents.send('app:tray-command', cmd)
}

function refreshTrayMenu(): void {
  if (!appTray) {
    return
  }
  const menu = buildTrayContextMenu({
    getMainWindow: () => mainWindow,
    showMain: showOrRestoreMainWindow,
    sendCommand: traySendCommand,
    openExternal: openExternalUrlMain,
    quitApp: performAppQuit,
    locale: trayLocale
  })
  appTray.setContextMenu(menu)
}

function setTrayLocaleOnly(code: string): void {
  trayLocale = code
  refreshTrayMenu()
}

function traySendCommand(cmd: TrayCommand): void {
  if (cmd.type === 'set-locale') {
    setTrayLocaleOnly(cmd.code)
  }
  sendTrayCommand(cmd)
}

function performAppQuit(): void {
  setImmediate(() => {
    isAppQuitting = true
    app.quit()
  })
}

/** 与 `ipcMain` `app:restart` 相同逻辑，供托盘菜单复用 */
function performAppRestart(): void {
  setImmediate(() => {
    const cleanArgs = process.argv.slice(1).filter((a) => !a.startsWith(SYNCWEB_RENDERER_URL_ARG))
    const persisted = readPersistedDevRendererUrlFromUserData()
    const rendererUrlForRestart =
      process.env['ELECTRON_RENDERER_URL']?.trim() ||
      persisted ||
      (process.env['NODE_ENV_ELECTRON_VITE'] === 'development' ? 'http://127.0.0.1:5173/' : '')
    const isLocalViteUrl =
      !!rendererUrlForRestart && /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(rendererUrlForRestart)

    if (!app.isPackaged && isLocalViteUrl) {
      writePersistedDevRendererUrlToUserData(rendererUrlForRestart)
      try {
        writeFileSync(
          SYNCWEB_DEV_RENDERER_URL_FILE,
          JSON.stringify({ url: rendererUrlForRestart, t: Date.now() }),
          'utf8'
        )
      } catch {
        /* ignore */
      }
      try {
        const child = spawn(process.execPath, cleanArgs, {
          env: { ...process.env, ELECTRON_RENDERER_URL: rendererUrlForRestart },
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        })
        child.on('error', (err) => {
          console.error('[sync-web] dev restart spawn error', err)
        })
        if (child.pid !== undefined) {
          child.unref()
          console.info('[sync-web] dev restart: spawned process', child.pid)
          app.quit()
          return
        }
        console.error('[sync-web] dev restart: spawn returned no pid, falling back to relaunch')
      } catch (e) {
        console.error('[sync-web] dev restart spawn failed', e)
      }
    }

    const argv = [...cleanArgs]
    if (rendererUrlForRestart) {
      argv.push(`${SYNCWEB_RENDERER_URL_ARG}${encodeURIComponent(rendererUrlForRestart)}`)
    }
    app.relaunch(argv.length > 0 ? { args: argv } : undefined)
    app.quit()
  })
}

function ensureTray(): void {
  if (appTray) {
    return
  }
  const icon = trayIconImage()
  if (icon.isEmpty()) {
    console.warn('[sync-web] tray: 跳过创建（无有效图标）')
    return
  }
  const tray = new Tray(icon)
  tray.setToolTip('Ark Sync')
  appTray = tray
  refreshTrayMenu()
  tray.on('click', () => {
    showOrRestoreMainWindow()
  })
}

function createWindow(): void {
  const isMac = process.platform === 'darwin'
  const isWin = process.platform === 'win32'
  const isLinux = process.platform === 'linux'
  /** Windows / Linux：无边框 + 渲染层自绘标题栏（WSLg 默认系统标题栏观感差） */
  const customTitlebar = isWin || isLinux

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
        : isLinux
          ? {
              frame: false,
              autoHideMenuBar: true,
              /** 部分 GTK 主题下尽量请求深色；与界面主题一致 */
              darkTheme: true
            }
          : {
              darkTheme: true
            }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false
    }
  })

  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null
    }
  })
  /** Windows / Linux：点关闭隐藏到托盘，不结束进程；macOS 保留默认关闭行为 */
  win.on('close', (e) => {
    if (process.platform === 'darwin') {
      return
    }
    if (!isAppQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  if (customTitlebar) {
    win.setTitle('Ark Sync')
    win.removeMenu()
  }

  const devRendererUrl = getDevRendererUrl()

  win.webContents.once('did-finish-load', () => {
    if (win.isDestroyed()) {
      return
    }
    const loaded = win.webContents.getURL()
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(loaded)) {
      writePersistedDevRendererUrlToUserData(loaded)
    }
    if (isWin) {
      applyWindowsWindowChrome(win)
    }
  })

  win.once('ready-to-show', () => {
    if (isWin) {
      applyWindowsWindowChrome(win)
    }
    win.show()
  })

  if (customTitlebar) {
    const emitMax = (): void => {
      if (win.isDestroyed()) {
        return
      }
      win.webContents.send('window:maximized', win.isMaximized())
    }
    win.on('maximize', emitMax)
    win.on('unmaximize', emitMax)
  }

  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (isMainFrame) {
      console.error('[sync-web] renderer did-fail-load', { code, desc, url })
    }
  })

  if (devRendererUrl) {
    win.loadURL(devRendererUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  /** 必须为 system，否则无法随 Windows 设置 → 个性化 → 颜色 / 明暗 切换 */
  nativeTheme.themeSource = 'system'
  trayLocale = app.getLocale() || trayLocale

  ipcMain.handle('app:getSystemLocale', () => app.getLocale())

  ipcMain.handle('app:getSystemInfo', () => ({
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    chromeVersion: process.versions.chrome
  }))

  await startBundledSyncthingIfPresent()

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
  ipcMain.handle('env:scanThirdParty', () => scanThirdPartyProducts({ force: true }))
  ipcMain.handle('env:listAgentArtifacts', (_e, opts?: unknown) => {
    const force =
      opts != null && typeof opts === 'object' && (opts as { force?: boolean }).force === true
    return listAgentArtifactsDetails(force ? { force: true } : undefined)
  })
  ipcMain.handle('env:exportAgentArtifactsToSyncTmp', () => exportAgentArtifactsToSyncTmp())
  ipcMain.handle('env:syncAgentConfigsWithRelay', () => syncAgentConfigsWithRelay())
  ipcMain.handle('env:syncAgentConfigsDryRun', () => syncAgentConfigs({ dryRun: true }))
  ipcMain.handle('env:scanSyncRelayContent', () => scanSyncRelayContent())
  ipcMain.handle('env:rollbackAgentConfigSync', (_e, runId: unknown) =>
    rollbackAgentConfigSync(typeof runId === 'string' ? runId : '')
  )
  ipcMain.handle('env:scanSkillsSecurity', async () => scanSkillsSecurity())
  ipcMain.handle('env:getSecurityRulesSyncStatus', () => getSecurityRulesSyncStatus())
  ipcMain.handle('env:getSecurityRulesPaths', () => getSecurityRulesPaths())
  ipcMain.handle('env:installThirdParty', async (_e, productId: unknown) => {
    const r = await runThirdPartyInstallScript(typeof productId === 'string' ? productId : '')
    if (r.ok) {
      invalidateThirdPartyScanCache()
    }
    return r
  })

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

  ipcMain.handle('app:restart', () => {
    // 须用 quit（会走 before-quit），否则 app.exit 不触发 before-quit，内嵌进程可能占端口导致「重启无反应」
    performAppRestart()
  })
  ipcMain.handle('app:quit', () => {
    performAppQuit()
  })
  ipcMain.handle('app:setTrayLocale', (_e, code: unknown) => {
    if (typeof code !== 'string' || !code.trim()) {
      return false
    }
    setTrayLocaleOnly(code.trim())
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

  setSecurityRulesSyncStatusBroadcaster(() => {
    const payload = getSecurityRulesSyncStatus()
    const w = mainWindow
    if (w && !w.isDestroyed()) {
      w.webContents.send('env:security-rules-sync-status', payload)
    }
  })

  startSecurityRulesSyncOnLaunch()

  createWindow()
  ensureTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      showOrRestoreMainWindow()
    }
  })
})

app.on('before-quit', () => {
  isAppQuitting = true
  stopBundledSyncthing()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
