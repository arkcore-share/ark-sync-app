import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, normalize } from 'node:path'
import { THIRD_PARTY_SCAN_CATALOG } from '../shared/thirdPartyCatalog.js'
import type { ThirdPartyScanResult, ThirdPartyScanRow } from '../shared/thirdPartyScanTypes.js'

const WIN = process.platform === 'win32'

type ProductDef = {
  id: string
  name: string
  cmds: string[]
  dirNeedles?: string[]
  npmNeedles?: string[]
}

const BY_ID: Record<string, { cmds: string[]; dirNeedles?: string[]; npmNeedles?: string[] }> = {
  'claude-code': {
    cmds: ['claude', 'claude-code'],
    dirNeedles: ['claude', 'anthropic'],
    npmNeedles: ['@anthropic-ai/claude-code', 'claude-code']
  },
  hermes: {
    cmds: ['hermes', 'hermes.exe']
  },
  openclaw: {
    cmds: ['openclaw', 'open-claw', 'openclaw.exe'],
    dirNeedles: ['openclaw', 'open-claw'],
    npmNeedles: ['openclaw', 'open-claw']
  },
  qclaw: {
    cmds: ['qclaw', 'q-claw', 'qclaw.exe'],
    dirNeedles: ['qclaw', 'q-claw'],
    npmNeedles: ['qclaw']
  },
  kimiclaw: {
    cmds: ['kimiclaw', 'kimi-claw', 'kimiclaw.exe'],
    dirNeedles: ['kimiclaw', 'kimi-claw'],
    npmNeedles: ['kimiclaw', 'kimi-claw']
  },
  'molili-claw': {
    cmds: ['moliliclaw', 'molili-claw', 'moliliclaw.exe'],
    dirNeedles: ['molili', 'moliliclaw', 'molili-claw'],
    npmNeedles: ['moliliclaw', 'molili-claw', 'molili']
  },
  maxclaw: {
    cmds: ['maxclaw', 'max-claw', 'maxclaw.exe'],
    dirNeedles: ['maxclaw', 'max-claw'],
    npmNeedles: ['maxclaw']
  },
  copaw: {
    cmds: ['copaw', 'co-paw', 'copaw.exe'],
    dirNeedles: ['copaw', 'co-paw'],
    npmNeedles: ['copaw']
  },
  'lobster-ai': {
    cmds: ['lobsterai', 'lobster-ai', 'lobster', 'lobsterai.exe'],
    dirNeedles: ['lobsterai', 'lobster-ai', 'lobster'],
    npmNeedles: ['lobster-ai', 'lobsterai']
  },
  zeroclaw: {
    cmds: ['zeroclaw', 'zero-claw', 'zeroclaw.exe'],
    dirNeedles: ['zeroclaw', 'zero-claw'],
    npmNeedles: ['zeroclaw', 'zero-claw']
  }
}

const PRODUCTS: ProductDef[] = THIRD_PARTY_SCAN_CATALOG.map((c) => {
  const rule = BY_ID[c.id]
  if (!rule) {
    throw new Error(`thirdPartyScan: missing rules for ${c.id}`)
  }
  return { id: c.id, name: c.name, ...rule }
})

function commandFound(cmd: string): boolean {
  const base = cmd.replace(/\.exe$/i, '')
  try {
    if (WIN) {
      const r = spawnSync('where.exe', [base], {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
        shell: false
      })
      return r.status === 0 && !!r.stdout?.trim()
    }
    const r = spawnSync('which', [base], { encoding: 'utf8', timeout: 5000, shell: false })
    return r.status === 0 && !!r.stdout?.trim()
  } catch {
    return false
  }
}

function anyCommandFound(cmds: string[]): { ok: boolean; via?: string } {
  for (const c of cmds) {
    if (commandFound(c)) {
      return { ok: true, via: `PATH: ${c.replace(/\.exe$/i, '')}` }
    }
  }
  return { ok: false }
}

function dirHit(needles: string[]): { ok: boolean; via?: string } {
  const bases = [
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
    process.env['LOCALAPPDATA'] ? join(process.env['LOCALAPPDATA'], 'Programs') : ''
  ].filter((p): p is string => !!p && existsSync(p))

  for (const root of bases) {
    try {
      for (const ent of readdirSync(root, { withFileTypes: true })) {
        const lower = ent.name.toLowerCase()
        for (const n of needles) {
          if (lower.includes(n.toLowerCase())) {
            return { ok: true, via: `目录: ${join(root, ent.name)}` }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  return { ok: false }
}

let npmGlobalCache: string | null = null
function npmGlobalListLower(): string {
  if (npmGlobalCache !== null) {
    return npmGlobalCache
  }
  try {
    const r = spawnSync(WIN ? 'npm.cmd' : 'npm', ['list', '-g', '--depth=0'], {
      encoding: 'utf8',
      timeout: 12000,
      windowsHide: true,
      shell: false
    })
    npmGlobalCache = `${r.stdout || ''}\n${r.stderr || ''}`.toLowerCase()
  } catch {
    npmGlobalCache = ''
  }
  return npmGlobalCache
}

function npmHit(needles: string[]): { ok: boolean; via?: string } {
  const blob = npmGlobalListLower()
  if (!blob) {
    return { ok: false }
  }
  for (const n of needles) {
    if (blob.includes(n.toLowerCase())) {
      return { ok: true, via: `npm 全局: ${n}` }
    }
  }
  return { ok: false }
}

/** `npm root -g` 下的 `node_modules` 绝对路径（不依赖 list 文本解析，安装后更易命中） */
function npmGlobalNodeModulesRoot(): string | null {
  try {
    const r = spawnSync(WIN ? 'npm.cmd' : 'npm', ['root', '-g'], {
      encoding: 'utf8',
      timeout: 12000,
      windowsHide: true,
      shell: false
    })
    if (r.status !== 0) {
      return null
    }
    const line = r.stdout?.trim().split(/\r?\n/)[0]?.trim()
    if (!line || !existsSync(line)) {
      return null
    }
    return line
  } catch {
    return null
  }
}

/** 全局 node_modules 下是否存在该包目录（支持 @scope/name 与普通包名） */
function npmGlobalDirHit(needles: string[]): { ok: boolean; via?: string } {
  const root = npmGlobalNodeModulesRoot()
  if (!root) {
    return { ok: false }
  }
  for (const n of needles) {
    const parts = n.split('/').filter(Boolean)
    const abs =
      parts[0]?.startsWith('@') && parts.length >= 2
        ? join(root, parts[0], parts[1])
        : join(root, parts[0] ?? n)
    if (existsSync(abs)) {
      return { ok: true, via: `npm 全局目录: ${n}` }
    }
  }
  return { ok: false }
}

/** Nous Hermes Agent：优先 %LOCALAPPDATA%\hermes，其次 ~/.hermes（Windows 上两种都可能出现） */
function hermesAgentDataDirCandidates(): string[] {
  const home = homedir()
  const out: string[] = []
  if (WIN && process.env['LOCALAPPDATA']) {
    out.push(normalize(join(process.env['LOCALAPPDATA'], 'hermes')))
  }
  out.push(normalize(join(home, '.hermes')))
  return [...new Set(out)]
}

function hermesAgentNousInstalled(): { ok: boolean; via?: string } {
  for (const dir of hermesAgentDataDirCandidates()) {
    if (existsSync(dir)) {
      return { ok: true, via: `Hermes Agent: ${dir}` }
    }
  }
  return { ok: false }
}

/** 邮件/调度版 Hermes：~/.config/hermes；常与 Himalaya 缓存 ~/.local/share/himalaya 并存 */
function hermesEmailLayoutInstalled(): { ok: boolean; via?: string } {
  const home = homedir()
  const cfg = normalize(join(home, '.config', 'hermes'))
  if (existsSync(cfg)) {
    return { ok: true, via: `Hermes: ${cfg}` }
  }
  const himalaya = normalize(join(home, '.local', 'share', 'himalaya'))
  if (existsSync(himalaya)) {
    return { ok: true, via: `Himalaya: ${himalaya}` }
  }
  return { ok: false }
}

/**
 * 与智能体页 artifact 扫描一致的数据根路径。Electron 继承的 PATH 常比终端短，目录存在即可视为已使用/安装过。
 */
function thirdPartyDataRootCandidates(id: string): string[] {
  const home = homedir()
  if (id === 'hermes') {
    const home = homedir()
    return [
      normalize(join(home, '.config', 'hermes')),
      normalize(join(home, '.local', 'share', 'himalaya')),
      ...hermesAgentDataDirCandidates()
    ]
  }
  if (id === 'claude-code') {
    const paths = [normalize(join(home, '.claude'))]
    if (WIN && process.env['APPDATA']) {
      paths.push(normalize(join(process.env['APPDATA'], 'Claude')))
    }
    return [...new Set(paths)]
  }
  const single: Record<string, string> = {
    openclaw: join(home, '.openclaw'),
    qclaw: join(home, '.qclaw'),
    kimiclaw: join(home, '.kimiclaw'),
    'molili-claw': join(home, '.molili-claw'),
    maxclaw: join(home, '.maxclaw'),
    copaw: join(home, '.copaw'),
    'lobster-ai': join(home, '.lobster-ai'),
    zeroclaw: join(home, '.zeroclaw')
  }
  const p = single[id]
  return p ? [normalize(p)] : []
}

function dataDirHitForProduct(id: string): { ok: boolean; via?: string } {
  if (id === 'hermes') {
    return { ok: false }
  }
  for (const dir of thirdPartyDataRootCandidates(id)) {
    if (dir && existsSync(dir)) {
      return { ok: true, via: `数据目录: ${dir}` }
    }
  }
  return { ok: false }
}

/** PATH 上的 hermes 是否来自误装的 hermes-engine-cli（React Native 字节码工具，非 Nous Agent） */
function hermesPathLooksLikeEngineCli(): boolean {
  try {
    if (WIN) {
      const r = spawnSync('where.exe', ['hermes'], {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
        shell: false
      })
      if (r.status !== 0 || !r.stdout?.trim()) {
        return false
      }
      const first = r.stdout.trim().split(/\r?\n/)[0]?.toLowerCase() ?? ''
      return first.includes('hermes-engine-cli')
    }
    const r = spawnSync('which', ['hermes'], { encoding: 'utf8', timeout: 5000, shell: false })
    if (r.status !== 0 || !r.stdout?.trim()) {
      return false
    }
    return r.stdout.toLowerCase().includes('hermes-engine-cli')
  } catch {
    return false
  }
}

function scanHermesAgent(p: ProductDef): ThirdPartyScanRow {
  const email = hermesEmailLayoutInstalled()
  if (email.ok) {
    return { id: p.id, name: p.name, installed: true, via: email.via }
  }
  const nous = hermesAgentNousInstalled()
  if (nous.ok) {
    return { id: p.id, name: p.name, installed: true, via: nous.via }
  }
  const cmd = anyCommandFound(p.cmds)
  if (cmd.ok && !hermesPathLooksLikeEngineCli()) {
    return { id: p.id, name: p.name, installed: true, via: cmd.via }
  }
  return { id: p.id, name: p.name, installed: false }
}

function scanOne(p: ProductDef): ThirdPartyScanRow {
  if (p.id === 'hermes') {
    return scanHermesAgent(p)
  }
  const cmd = anyCommandFound(p.cmds)
  if (cmd.ok) {
    return { id: p.id, name: p.name, installed: true, via: cmd.via }
  }
  if (p.dirNeedles?.length) {
    const d = dirHit(p.dirNeedles)
    if (d.ok) {
      return { id: p.id, name: p.name, installed: true, via: d.via }
    }
  }
  if (p.npmNeedles?.length) {
    const n = npmHit(p.npmNeedles)
    if (n.ok) {
      return { id: p.id, name: p.name, installed: true, via: n.via }
    }
    const nd = npmGlobalDirHit(p.npmNeedles)
    if (nd.ok) {
      return { id: p.id, name: p.name, installed: true, via: nd.via }
    }
  }
  const dataDir = dataDirHitForProduct(p.id)
  if (dataDir.ok) {
    return { id: p.id, name: p.name, installed: true, via: dataDir.via }
  }
  return { id: p.id, name: p.name, installed: false }
}

let thirdPartyScanCache: { result: ThirdPartyScanResult; at: number } | null = null
/** 短时间内重复打开智能体页等场景复用结果，避免反复 `where` / `npm list -g` */
const THIRD_PARTY_SCAN_CACHE_TTL_MS = 5 * 60 * 1000

export function invalidateThirdPartyScanCache(): void {
  thirdPartyScanCache = null
}

export function scanThirdPartyProducts(opts?: { force?: boolean }): ThirdPartyScanResult {
  const force = opts?.force === true
  const now = Date.now()
  if (!force && thirdPartyScanCache != null && now - thirdPartyScanCache.at < THIRD_PARTY_SCAN_CACHE_TTL_MS) {
    return thirdPartyScanCache.result
  }
  npmGlobalCache = null
  const t0 = Date.now()
  const items = PRODUCTS.map(scanOne)
  const result: ThirdPartyScanResult = {
    items,
    scannedAt: t0,
    durationMs: Date.now() - t0
  }
  thirdPartyScanCache = { result, at: now }
  return result
}
