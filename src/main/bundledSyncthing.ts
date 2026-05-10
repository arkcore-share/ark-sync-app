import { spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { createConnection } from 'node:net'
import { dirname, isAbsolute, join } from 'node:path'
import { app } from 'electron'
import { bundledBackendPath, getBundledBackendRoot } from './bundledPaths'

let child: ChildProcess | null = null
let legacyAttempted = false
/** 为 true 时表示主进程正在退出，子进程结束不应再拉起 legacy */
let appShuttingDown = false

/** 默认内嵌可执行文件名：Windows 带 `.exe`，Linux/macOS 无扩展名 */
const DEFAULT_BUNDLED_EXE = process.platform === 'win32' ? 'arksync.exe' : 'arksync'

/**
 * 解析内嵌可执行文件路径。
 * - `SYNCWEB_BUNDLED_EXE`：仅文件名（在 `resources/backend/` 下）或绝对路径。
 */
function resolveBundledExecutable(): string | null {
  const override = process.env['SYNCWEB_BUNDLED_EXE']?.trim()
  if (override) {
    const p = isAbsolute(override) ? override : bundledBackendPath(override)
    if (existsSync(p)) {
      return p
    }
    logLineEarly(`SYNCWEB_BUNDLED_EXE 未找到文件：${p}`)
    return null
  }

  const p = bundledBackendPath(DEFAULT_BUNDLED_EXE)
  if (existsSync(p)) {
    return p
  }

  const root = getBundledBackendRoot()
  logLineEarly(
    `未找到内嵌程序。请将 ${DEFAULT_BUNDLED_EXE} 放在 ${root}，或设置 SYNCWEB_BUNDLED_EXE`
  )
  return null
}

/** logLine 依赖 userData，启动极早时改用 console */
function logLineEarly(msg: string): void {
  console.info('[bundled-syncthing]', msg)
}

function logLine(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  try {
    console.info('[bundled-syncthing]', msg)
    appendFileSync(join(app.getPath('userData'), 'bundled-syncthing.log'), line, 'utf8')
  } catch {
    /* ignore */
  }
}

function parseGuiHostPort(): { host: string; port: number } {
  const guiRaw = process.env['SYNCWEB_BUNDLED_GUI_ADDRESS']?.trim() || '127.0.0.1:8384'
  const guiAddr = guiRaw.replace(/^https?:\/\//i, '').replace(/\/$/, '')
  const idx = guiAddr.lastIndexOf(':')
  if (idx <= 0) {
    return { host: '127.0.0.1', port: 8384 }
  }
  const host = guiAddr.slice(0, idx)
  const port = Number(guiAddr.slice(idx + 1))
  return { host, port: Number.isFinite(port) && port > 0 ? port : 8384 }
}

/** 内嵌实例 GUI 地址（与连接页默认一致），可用环境变量覆盖 */
export function getBundledSyncthingBaseUrl(): string {
  const { host, port } = parseGuiHostPort()
  return `http://${host}:${port}`
}

function waitForTcpPort(host: string, port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tryOnce = (): void => {
      if (Date.now() > deadline) {
        reject(new Error(`等待 ${host}:${port} 超时（${timeoutMs}ms）`))
        return
      }
      const s = createConnection({ host, port }, () => {
        s.end()
        resolve()
      })
      s.on('error', () => {
        s.destroy()
        setTimeout(tryOnce, 250)
      })
    }
    tryOnce()
  })
}

/** 传给内嵌后端：可用父进程 PID + 是否打包 做启动门禁（开发态父进程多为 electron.exe，非 arksync_client.exe） */
function bundledChildEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SYNCWEB_ELECTRON_MAIN_PID: String(process.pid),
    SYNCWEB_ELECTRON_PACKAGED: app.isPackaged ? '1' : '0'
  }
}

function spawnWithArgs(exe: string, exeDir: string, home: string, guiAddr: string, label: string): ChildProcess {
  logLine(`启动 (${label}): ${exe}`)
  logLine(`  cwd=${exeDir}`)
  logLine(`  home=${home}`)
  logLine(`  gui-address=${guiAddr}`)

  const proc = spawn(exe, ['serve', '--no-browser', `--gui-address=${guiAddr}`, '--home', home], {
    cwd: exeDir,
    detached: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: bundledChildEnv()
  })

  proc.stdout?.on('data', (buf) => {
    logLine(`[${label} stdout] ${buf.toString().trimEnd()}`)
  })
  proc.stderr?.on('data', (buf) => {
    logLine(`[${label} stderr] ${buf.toString().trimEnd()}`)
  })
  proc.on('error', (err) => {
    logLine(`[${label} spawn error] ${err instanceof Error ? err.message : String(err)}`)
  })
  return proc
}

/** 无 `serve` 子命令的旧版 / 部分 fork */
function spawnLegacy(exe: string, exeDir: string, home: string, guiAddr: string): ChildProcess {
  logLine('回退：旧版命令行（无 serve 子命令）')
  const proc = spawn(exe, ['-no-browser', `-gui-address=${guiAddr}`, '-home', home], {
    cwd: exeDir,
    detached: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: bundledChildEnv()
  })
  proc.stdout?.on('data', (buf) => logLine(`[legacy stdout] ${buf.toString().trimEnd()}`))
  proc.stderr?.on('data', (buf) => logLine(`[legacy stderr] ${buf.toString().trimEnd()}`))
  proc.on('error', (err) =>
    logLine(`[legacy spawn error] ${err instanceof Error ? err.message : String(err)}`)
  )
  return proc
}

/**
 * 若 `resources/backend/` 下存在 Ark Sync 同步引擎可执行文件，则启动并（可选）等待 GUI 端口可连。
 * `SYNCWEB_DISABLE_BUNDLED_SYNCTHING=1`：跳过。
 */
export async function startBundledSyncthingIfPresent(): Promise<void> {
  legacyAttempted = false
  appShuttingDown = false
  if (process.env['SYNCWEB_DISABLE_BUNDLED_SYNCTHING'] === '1') {
    return
  }
  const exe = resolveBundledExecutable()
  if (!exe) {
    return
  }
  logLine(`使用内嵌程序：${exe}`)

  const home = join(app.getPath('userData'), 'bundled-syncthing')
  if (!existsSync(home)) {
    mkdirSync(home, { recursive: true })
  }

  const guiRaw = process.env['SYNCWEB_BUNDLED_GUI_ADDRESS']?.trim() || '127.0.0.1:8384'
  const guiAddr = guiRaw.replace(/^https?:\/\//i, '').replace(/\/$/, '')
  const { host, port } = parseGuiHostPort()
  const exeDir = dirname(exe)

  child = spawnWithArgs(exe, exeDir, home, guiAddr, 'serve')

  child.on('exit', (code, signal) => {
    if (child) {
      child = null
    }
    logLine(`serve 进程结束 code=${code} signal=${signal ?? ''}`)
    if (
      !appShuttingDown &&
      !legacyAttempted &&
      code !== 0 &&
      code !== null
    ) {
      legacyAttempted = true
      child = spawnLegacy(exe, exeDir, home, guiAddr)
      child.on('exit', (c, sig) => {
        logLine(`legacy 进程结束 code=${c} signal=${sig ?? ''}`)
        child = null
      })
    }
  })

  const waitMs = Number(process.env['SYNCWEB_BUNDLED_START_WAIT_MS'] ?? '20000')
  try {
    await waitForTcpPort(host, port, waitMs)
    logLine(`GUI 已监听 ${host}:${port}`)
  } catch (e) {
    logLine(
      `GUI 在 ${waitMs}ms 内未就绪（若仍 ECONNREFUSED，请查看 userData 下 bundled-syncthing.log）：${
        e instanceof Error ? e.message : String(e)
      }`
    )
    if (!app.isPackaged) {
      logLine(
        '提示：开发模式 (npm run dev) 下 Electron 主进程名为 electron.exe。若 arksync 仅允许父进程 arksync_client.exe，子进程会拒绝启动导致 8384 无监听；请在后端同时允许 electron.exe，或改用打包后的客户端测试。子进程已注入 SYNCWEB_ELECTRON_MAIN_PID、SYNCWEB_ELECTRON_PACKAGED 供校验。'
      )
    }
  }
}

export function stopBundledSyncthing(): void {
  appShuttingDown = true
  if (child && !child.killed) {
    try {
      child.kill()
    } catch {
      /* ignore */
    }
    child = null
  }
}
