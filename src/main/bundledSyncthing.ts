import { execFile, spawn, type ChildProcess } from 'node:child_process'
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
    logLineEarly(`SYNCWEB_BUNDLED_EXE file not found: ${p}`)
    return null
  }

  const p = bundledBackendPath(DEFAULT_BUNDLED_EXE)
  if (existsSync(p)) {
    return p
  }

  const root = getBundledBackendRoot()
  logLineEarly(
    `Bundled backend not found. Place ${DEFAULT_BUNDLED_EXE} under ${root} or set SYNCWEB_BUNDLED_EXE`
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
        reject(new Error(`Timeout waiting for ${host}:${port} (${timeoutMs}ms)`))
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

/** 快速探测端口是否已有进程监听（避免再启一个内嵌实例导致 home 目录锁冲突） */
function isTcpPortOpen(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs)
    const s = createConnection({ host, port }, () => {
      clearTimeout(timer)
      s.end()
      resolve(true)
    })
    s.on('error', () => {
      clearTimeout(timer)
      s.destroy()
      resolve(false)
    })
  })
}

function execFileUtf8(
  file: string,
  args: readonly string[]
): Promise<{ stdout: string; err?: NodeJS.ErrnoException }> {
  return new Promise((resolve) => {
    execFile(file, [...args], { windowsHide: true, encoding: 'utf8' }, (err, stdout) => {
      resolve({
        stdout: typeof stdout === 'string' ? stdout : String(stdout ?? ''),
        err: err ?? undefined
      })
    })
  })
}

/** PIDs with TCP LISTEN on `port` (any local address). Never includes current Electron PID. */
async function listPidsListeningOnTcpPort(port: number): Promise<number[]> {
  const ownPid = process.pid
  const portSuffix = `:${port}`
  if (process.platform === 'win32') {
    const { stdout } = await execFileUtf8('netstat', ['-ano', '-p', 'TCP'])
    const pids = new Set<number>()
    for (const line of stdout.split(/\r?\n/)) {
      if (!line.toUpperCase().includes('LISTENING')) continue
      const parts = line.trim().split(/\s+/)
      if (parts.length < 5) continue
      const local = parts[1]
      if (!local.endsWith(portSuffix)) continue
      const pid = Number(parts[parts.length - 1])
      if (Number.isFinite(pid) && pid > 0 && pid !== ownPid) pids.add(pid)
    }
    return [...pids]
  }
  const { stdout, err } = await execFileUtf8('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
  const status = err && typeof err === 'object' && 'status' in err ? (err as { status?: number }).status : undefined
  if (err && status !== 1) {
    return []
  }
  const pids = new Set<number>()
  for (const line of stdout.split(/\r?\n/)) {
    const pid = Number(line.trim())
    if (Number.isFinite(pid) && pid > 0 && pid !== ownPid) pids.add(pid)
  }
  return [...pids]
}

async function terminatePidsHard(pids: number[]): Promise<void> {
  if (pids.length === 0) return
  if (process.platform === 'win32') {
    for (const pid of pids) {
      const { err } = await execFileUtf8('taskkill', ['/PID', String(pid), '/F', '/T'])
      if (err) {
        logLine(`taskkill /PID ${pid} /T /F: ${err.message}`)
      }
    }
    return
  }
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch (e) {
      logLine(`kill -9 ${pid}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

/** Free GUI TCP port before spawning bundled backend. Set SYNCWEB_BUNDLED_DONT_KILL_PORT=1 to disable. */
async function freeGuiListenPort(port: number): Promise<void> {
  const pids = await listPidsListeningOnTcpPort(port)
  if (pids.length === 0) {
    return
  }
  logLine(`Stopping process(es) listening on TCP ${port}: ${pids.join(', ')}`)
  await terminatePidsHard(pids)
  const settleMs = Number(process.env['SYNCWEB_BUNDLED_AFTER_KILL_MS'] ?? '600')
  if (settleMs > 0) {
    await new Promise((r) => setTimeout(r, settleMs))
  }
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
  logLine(`Starting (${label}): ${exe}`)
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

/**
 * 无 `serve` 子命令的旧版 Syncthing（极少用）。
 * 仅当设置 SYNCWEB_BUNDLED_TRY_LEGACY=1 时，在 serve 异常退出后才会尝试；默认关闭以免误触发。
 * 使用双横线参数，避免 `-no-browser` 被误解析为 `-n`。
 */
function spawnLegacy(exe: string, exeDir: string, home: string, guiAddr: string): ChildProcess {
  logLine('Legacy CLI (no serve subcommand; requires SYNCWEB_BUNDLED_TRY_LEGACY=1)')
  const proc = spawn(exe, ['--no-browser', `--gui-address=${guiAddr}`, '--home', home], {
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
 * 默认会先结束占用 GUI 端口（见 `SYNCWEB_BUNDLED_GUI_ADDRESS`，默认 8384）的 TCP 监听进程再启动内嵌实例；
 * `SYNCWEB_BUNDLED_DONT_KILL_PORT=1`：不结束占用端口的进程；若端口已被占用则仍跳过启动（与旧行为一致）。
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
  logLine(`Using bundled backend: ${exe}`)

  const home = join(app.getPath('userData'), 'bundled-syncthing')
  if (!existsSync(home)) {
    mkdirSync(home, { recursive: true })
  }

  const guiRaw = process.env['SYNCWEB_BUNDLED_GUI_ADDRESS']?.trim() || '127.0.0.1:8384'
  const guiAddr = guiRaw.replace(/^https?:\/\//i, '').replace(/\/$/, '')
  const { host, port } = parseGuiHostPort()
  const exeDir = dirname(exe)

  const dontKillPort = process.env['SYNCWEB_BUNDLED_DONT_KILL_PORT'] === '1'
  if (!dontKillPort) {
    await freeGuiListenPort(port)
  }

  const skipProbeMs = Number(process.env['SYNCWEB_BUNDLED_SKIP_IF_PORT_OPEN_MS'] ?? '800')
  if (dontKillPort && skipProbeMs > 0 && (await isTcpPortOpen(host, port, skipProbeMs))) {
    logLine(
      `GUI already listening on ${host}:${port}; skipping bundled start (SYNCWEB_BUNDLED_DONT_KILL_PORT=1). Stop whatever owns port ${port} or unset DONT_KILL to let the app free the port first.`
    )
    return
  }

  child = spawnWithArgs(exe, exeDir, home, guiAddr, 'serve')

  child.on('exit', (code, signal) => {
    if (child) {
      child = null
    }
    logLine(`serve exited code=${code} signal=${signal ?? ''}`)
    const tryLegacy = process.env['SYNCWEB_BUNDLED_TRY_LEGACY'] === '1'
    if (
      tryLegacy &&
      !appShuttingDown &&
      !legacyAttempted &&
      code !== 0 &&
      code !== null
    ) {
      legacyAttempted = true
      child = spawnLegacy(exe, exeDir, home, guiAddr)
      child.on('exit', (c, sig) => {
        logLine(`legacy exited code=${c} signal=${sig ?? ''}`)
        child = null
      })
    } else if (!tryLegacy && code !== 0 && code !== null) {
      logLine(
        `Bundled serve exited without legacy fallback. If this was a lock/already-running error: stop other Syncthing/Ark Sync or free ${host}:${port}. Data dir: ${home} (do not delete lock files while an instance may still be running).`
      )
    }
  })

  const waitMs = Number(process.env['SYNCWEB_BUNDLED_START_WAIT_MS'] ?? '20000')
  try {
    await waitForTcpPort(host, port, waitMs)
    logLine(`GUI listening on ${host}:${port}`)
  } catch (e) {
    logLine(
      `GUI not ready within ${waitMs}ms (if ECONNREFUSED persists, see userData bundled-syncthing.log): ${
        e instanceof Error ? e.message : String(e)
      }`
    )
    if (!app.isPackaged) {
      logLine(
        'Dev hint: npm run dev uses electron.exe as parent. If arksync only allows arksync_client.exe, serve may refuse to bind 8384. Allow electron.exe in backend checks or test a packaged build. Child env includes SYNCWEB_ELECTRON_MAIN_PID and SYNCWEB_ELECTRON_PACKAGED.'
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
