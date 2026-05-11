import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { THIRD_PARTY_SCAN_CATALOG } from '../shared/thirdPartyCatalog.js'
import type { ThirdPartyInstallResult } from '../shared/thirdPartyInstallTypes.js'
import { scanThirdPartyProducts } from './thirdPartyScan.js'

const ALLOWED_IDS = new Set(THIRD_PARTY_SCAN_CATALOG.map((c) => c.id))

/** Electron 从快捷方式启动时子进程 PATH 常不完整，合并注册表中的 Machine/User PATH（Windows）。 */
function spawnEnvWithWindowsPath(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  if (process.platform !== 'win32') {
    return env
  }
  try {
    const machine = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', "[Environment]::GetEnvironmentVariable('Path','Machine')"],
      { encoding: 'utf8', windowsHide: true, timeout: 8000 }
    ).trim()
    const user = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', "[Environment]::GetEnvironmentVariable('Path','User')"],
      { encoding: 'utf8', windowsHide: true, timeout: 8000 }
    ).trim()
    const cur = env.Path ?? ''
    env.Path = [machine, user, cur].filter(Boolean).join(';')
  } catch {
    /* 保持原 PATH */
  }
  return env
}

/** 多数安装脚本依赖 npm；Hermes Agent 走官方 install.ps1/install.sh，不强制预装 npm。 */
function npmAvailable(): boolean {
  const env = spawnEnvWithWindowsPath()
  if (process.platform === 'win32') {
    const r = spawnSync('where.exe', ['npm'], {
      encoding: 'utf8',
      windowsHide: true,
      env,
      timeout: 12000
    })
    return r.status === 0 && !!r.stdout?.trim()
  }
  const r = spawnSync('sh', ['-c', 'command -v npm'], {
    encoding: 'utf8',
    env,
    timeout: 12000
  })
  return r.status === 0 && !!r.stdout?.trim()
}

/**
 * 缺少 npm 时：Windows 尝试 winget 安装 Node LTS；macOS 尝试 brew install node；Linux 仅提示手动安装（不跑 sudo）。
 * @returns null 表示已具备 npm，可继续跑产品脚本；否则为失败结果，应直接返回给渲染进程。
 */
async function ensureNpmForThirdPartyInstall(): Promise<ThirdPartyInstallResult | null> {
  if (npmAvailable()) {
    return null
  }

  if (process.platform === 'win32') {
    const env = spawnEnvWithWindowsPath()
    const hasWinget =
      spawnSync('where.exe', ['winget'], { windowsHide: true, env, timeout: 8000 }).status === 0
    if (!hasWinget) {
      return {
        ok: false,
        error:
          '未检测到 npm，且系统找不到 winget。请先安装 Node.js（https://nodejs.org），安装完成后完全退出并重新打开本应用再试「一键安装」。',
        log: '',
        exitCode: null
      }
    }
    const wr = await collectSpawn(
      'winget.exe',
      [
        'install',
        '-e',
        '--id',
        'OpenJS.NodeJS.LTS',
        '--accept-package-agreements',
        '--accept-source-agreements',
        '--scope',
        'user'
      ],
      { windowsHide: true }
    )
    if (!npmAvailable()) {
      return {
        ok: false,
        error:
          '已尝试用 winget 安装 Node.js，但仍检测不到 npm。若安装刚完成，请完全退出并重新打开本应用；也可手动安装 Node.js：https://nodejs.org',
        log: wr.log,
        exitCode: wr.exitCode
      }
    }
    return null
  }

  if (process.platform === 'darwin') {
    const env = spawnEnvWithWindowsPath()
    const hasBrew =
      spawnSync('which', ['brew'], { encoding: 'utf8', env, timeout: 8000 }).status === 0
    if (!hasBrew) {
      return {
        ok: false,
        error:
          '未检测到 npm，且未找到 brew。请先安装 Node.js（https://nodejs.org 或自行安装 Homebrew 后执行 brew install node）。',
        log: '',
        exitCode: null
      }
    }
    const br = await collectSpawn('brew', ['install', 'node'], { windowsHide: true })
    if (!npmAvailable()) {
      return {
        ok: false,
        error:
          '已尝试执行 brew install node，但仍检测不到 npm。请在本机终端查看 brew 输出，或手动安装 Node.js。',
        log: br.log,
        exitCode: br.exitCode
      }
    }
    return null
  }

  return {
    ok: false,
    error:
      '未检测到 npm。Linux 下请用发行版包管理器安装 Node.js / npm（例如 apt / dnf）后重试。本应用不会自动执行需要 sudo 的安装。',
    log: '',
    exitCode: null
  }
}

export function getThirdPartyScriptsRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'scripts')
  }
  return join(__dirname, '../../scripts')
}

function collectSpawn(
  command: string,
  args: string[],
  options: { shell?: boolean; windowsHide?: boolean }
): Promise<ThirdPartyInstallResult> {
  return new Promise((resolve) => {
    const chunks: string[] = []
    const child = spawn(command, args, {
      ...options,
      env: spawnEnvWithWindowsPath()
    })
    child.stdout?.on('data', (d: Buffer) => chunks.push(d.toString('utf8')))
    child.stderr?.on('data', (d: Buffer) => chunks.push(d.toString('utf8')))
    child.on('error', (err) => {
      resolve({
        ok: false,
        error: err.message,
        log: chunks.join(''),
        exitCode: null
      })
    })
    child.on('close', (code) => {
      const log = chunks.join('').trimEnd()
      resolve({
        ok: code === 0,
        error: code === 0 ? undefined : `进程退出码 ${code}`,
        log,
        exitCode: code
      })
    })
  })
}

/** 运行 `scripts/third-party/<id>.ps1` 或 `.sh`（产品 id 须在白名单内） */
export async function runThirdPartyInstallScript(productId: string): Promise<ThirdPartyInstallResult> {
  if (!ALLOWED_IDS.has(productId)) {
    return { ok: false, error: '未知产品', log: '', exitCode: null }
  }
  const root = getThirdPartyScriptsRoot()
  const ext = process.platform === 'win32' ? '.ps1' : '.sh'
  const scriptPath = join(root, 'third-party', `${productId}${ext}`)
  if (!existsSync(scriptPath)) {
    return {
      ok: false,
      error: `未找到安装脚本：third-party/${productId}${ext}`,
      log: '',
      exitCode: null
    }
  }

  const pre = scanThirdPartyProducts({ force: true })
  const already = pre.items.find((i) => i.id === productId)
  if (already?.installed) {
    return {
      ok: true,
      log: `本机已能检测到「${already.name}」（${already.via ?? '已安装'}），未重复执行安装脚本。`,
      exitCode: 0
    }
  }

  // Hermes Agent 官方安装器自带/安装 Node，不强制先具备 npm
  if (productId !== 'hermes') {
    const npmPre = await ensureNpmForThirdPartyInstall()
    if (npmPre != null) {
      return npmPre
    }
  }

  if (process.platform === 'win32') {
    // PS 5.1：无 BOM 的 UTF-8 脚本会按系统 ANSI 误解析；捕获输出时与 UTF-8 解码对齐，减少乱码
    const q = scriptPath.replace(/'/g, "''")
    return collectSpawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; & '${q}'`
      ],
      { windowsHide: true }
    )
  }

  return collectSpawn('bash', [scriptPath], { shell: false })
}
