import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SecurityRulesPaths, SecurityRulesSyncStatus } from '../shared/securityRulesSyncTypes.js'

/** 官方默认规则（与 gitleaks 仓库同步） */
const GITLEAKS_TOML_URL =
  'https://raw.githubusercontent.com/gitleaks/gitleaks/master/config/gitleaks.toml'

/** 启动后延迟再拉取，避免抢首屏与主线程（毫秒） */
const BACKGROUND_SYNC_DELAY_MS = 4_000

const META_FILE = 'sync-meta.json'

type SyncMeta = {
  /** 本地日历日 YYYY-MM-DD，表示当日已成功下载 gitleaks.toml */
  lastSuccessDay?: string
  /** @deprecated 旧版「当日已尝试」；读取时忽略，仅成功日写入 {@link SyncMeta.lastSuccessDay} */
  lastPullDay?: string
}

export function securityRulesBaseDir(): string {
  return join(app.getPath('userData'), 'security-rules')
}

function metaPath(): string {
  return join(securityRulesBaseDir(), META_FILE)
}

function localCalendarDayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function readMeta(): SyncMeta | null {
  const p = metaPath()
  if (!existsSync(p)) {
    return null
  }
  try {
    const o = JSON.parse(readFileSync(p, 'utf8')) as SyncMeta
    if (o && (typeof o.lastSuccessDay === 'string' || typeof o.lastPullDay === 'string')) {
      return o
    }
  } catch {
    /* ignore */
  }
  return null
}

function writeMeta(m: SyncMeta): void {
  try {
    writeFileSync(metaPath(), JSON.stringify(m, null, 0), 'utf8')
  } catch {
    /* ignore */
  }
}

export function gitleaksConfigPath(): string {
  return join(securityRulesBaseDir(), 'gitleaks.toml')
}

/** 供界面展示：Windows 上通常为 `%APPDATA%\\<package.json name>\\security-rules`（当前 name 为 sync-web，不是 productName） */
export function getSecurityRulesPaths(): SecurityRulesPaths {
  return { dir: securityRulesBaseDir(), gitleaks: gitleaksConfigPath() }
}

let rulesDownloading = false
let statusBroadcaster: (() => void) | null = null

/** 由主窗口创建后注册，用于向渲染进程推送 {@link getSecurityRulesSyncStatus} 变化 */
export function setSecurityRulesSyncStatusBroadcaster(fn: () => void): void {
  statusBroadcaster = fn
}

function emitSecurityRulesSyncStatus(): void {
  statusBroadcaster?.()
}

function calendarFreshToday(): boolean {
  const meta = readMeta()
  return meta?.lastSuccessDay === localCalendarDayKey()
}

export function getSecurityRulesSyncStatus(): SecurityRulesSyncStatus {
  return {
    isFreshToday: calendarFreshToday(),
    isDownloading: rulesDownloading
  }
}

/** @returns gitleaks.toml 已成功写入磁盘 */
async function syncSecurityRuleBundles(): Promise<boolean> {
  const base = securityRulesBaseDir()
  mkdirSync(base, { recursive: true })

  try {
    const r = await fetch(GITLEAKS_TOML_URL, { signal: AbortSignal.timeout(120_000) })
    if (r.ok) {
      const text = await r.text()
      writeFileSync(join(base, 'gitleaks.toml'), text, 'utf8')
      console.log('[security-rules] gitleaks.toml updated')
      return true
    }
    console.warn('[security-rules] gitleaks HTTP', r.status)
  } catch (e) {
    console.warn('[security-rules] gitleaks download failed', e)
  }
  return false
}

/**
 * 应用启动后：延迟数秒再在后台拉取；同一自然日仅在**成功**下载 gitleaks.toml 后跳过，失败则下次启动可再试。
 */
export function startSecurityRulesSyncOnLaunch(): void {
  setTimeout(() => {
    void (async () => {
      try {
        const today = localCalendarDayKey()
        const meta = readMeta()
        if (meta?.lastSuccessDay === today) {
          return
        }
        const base = securityRulesBaseDir()
        mkdirSync(base, { recursive: true })
        rulesDownloading = true
        emitSecurityRulesSyncStatus()
        try {
          const ok = await syncSecurityRuleBundles()
          if (ok) {
            writeMeta({ lastSuccessDay: today })
          }
        } finally {
          rulesDownloading = false
          emitSecurityRulesSyncStatus()
        }
      } catch (e) {
        rulesDownloading = false
        emitSecurityRulesSyncStatus()
        console.warn('[security-rules] schedule error', e)
      }
    })()
  }, BACKGROUND_SYNC_DELAY_MS)
}

/**
 * 安全扫描**不等待**网络拉取：始终立即使用磁盘上已有规则（含昨日缓存）。
 * 保留此函数供将来扩展；当前为无操作。
 */
export async function ensureSecurityRulesSynced(): Promise<void> {
  return Promise.resolve()
}
