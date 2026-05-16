/**
 * Preload exposes `window.syncWeb` only inside Electron.
 * In a normal browser (e.g. http://localhost:5173/) we fall back to localStorage
 * so the React app can still be developed without launching Electron.
 */

import type {
  ConnectionPayload,
  SyncthingAssetIpc,
  SyncthingAssetResult,
  SyncthingRestIpc,
  SyncthingRestResult
} from '../env'
import type {
  AgentArtifactsDetail,
  AgentArtifactsSyncTmpExportResult,
  AgentConfigSyncResult,
  AgentConfigSyncRollbackResult,
  AgentConfigSyncScanResult
} from '../../shared/agentArtifactsTypes'
import type { ThirdPartyScanResult } from '../../shared/thirdPartyScanTypes'
import type { SecurityRulesPaths, SecurityRulesSyncStatus } from '../../shared/securityRulesSyncTypes'
import type { SkillsSecurityResult } from '../../shared/skillsSecurityTypes'
import type { ThirdPartyInstallResult } from '../../shared/thirdPartyInstallTypes'

const STORAGE_KEY = 'sync-web-connection'

export type { ConnectionPayload }

export async function syncthingRest(p: SyncthingRestIpc): Promise<SyncthingRestResult> {
  if (!isElectronApp() || !window.syncWeb?.syncthingRest) {
    return { ok: false, statusCode: 0, error: '免 API 密钥仅支持 Electron 窗口' }
  }
  return window.syncWeb.syncthingRest(p) as Promise<SyncthingRestResult>
}

export async function syncthingGetAsset(p: SyncthingAssetIpc): Promise<SyncthingAssetResult> {
  if (!isElectronApp() || !window.syncWeb?.syncthingGetAsset) {
    return { ok: false, error: '资源请求需要 Electron 窗口（或改用 API 密钥通过浏览器）' }
  }
  return window.syncWeb.syncthingGetAsset(p) as Promise<SyncthingAssetResult>
}

export function isElectronApp(): boolean {
  return typeof window !== 'undefined' && typeof window.syncWeb !== 'undefined'
}

export async function getConnection(): Promise<ConnectionPayload | null> {
  if (isElectronApp()) {
    return window.syncWeb.getConnection()
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }
    return JSON.parse(raw) as ConnectionPayload
  } catch {
    return null
  }
}

export async function setConnection(c: ConnectionPayload): Promise<boolean> {
  if (isElectronApp()) {
    return window.syncWeb.setConnection(c)
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
  return true
}

export async function clearConnection(): Promise<boolean> {
  if (isElectronApp()) {
    return window.syncWeb.clearConnection()
  }
  localStorage.removeItem(STORAGE_KEY)
  return true
}

export async function getSystemLocale(): Promise<string> {
  if (isElectronApp() && window.syncWeb?.getSystemLocale) {
    return window.syncWeb.getSystemLocale()
  }
  if (typeof navigator !== 'undefined') {
    return navigator.language || 'en'
  }
  return 'en'
}

export type SystemInfo = {
  platform: string
  arch: string
  electronVersion: string
  nodeVersion: string
  chromeVersion: string
}

export async function getSystemInfo(): Promise<SystemInfo | null> {
  if (isElectronApp() && window.syncWeb?.getSystemInfo) {
    return window.syncWeb.getSystemInfo()
  }
  return null
}

/** Open folder in file manager (Electron) or no-op in browser. */
export async function openPath(p: string): Promise<string> {
  if (isElectronApp()) {
    return window.syncWeb.openPath(p)
  }
  console.warn('[sync-web] openPath: only works in Electron:', p)
  return ''
}

export async function showItemInFolder(p: string): Promise<boolean> {
  if (isElectronApp()) {
    return window.syncWeb.showItemInFolder(p)
  }
  return false
}

/** 使用系统浏览器打开 http(s) 链接；纯浏览器环境下使用 window.open。 */
/** 重启整个 Electron 应用（内嵌 Ark Sync 引擎经 before-quit 结束后再由新进程拉起）。 */
export async function restartElectronApp(): Promise<boolean> {
  if (isElectronApp() && window.syncWeb?.restartApp) {
    try {
      await window.syncWeb.restartApp()
      return true
    } catch (e) {
      console.error('[sync-web] restartApp failed', e)
      return false
    }
  }
  if (!isElectronApp()) {
    window.location.reload()
    return true
  }
  return false
}

/** 退出整个 Electron 应用。 */
export async function quitElectronApp(): Promise<boolean> {
  if (isElectronApp() && window.syncWeb?.quitApp) {
    try {
      await window.syncWeb.quitApp()
      return true
    } catch (e) {
      console.error('[sync-web] quitApp failed', e)
      return false
    }
  }
  return false
}

export async function setTrayLocale(code: string): Promise<boolean> {
  if (!isElectronApp() || !window.syncWeb?.setTrayLocale) {
    return false
  }
  try {
    return await window.syncWeb.setTrayLocale(code)
  } catch {
    return false
  }
}

/** 主进程扫描本机是否安装常见 AI / Claw 系工具（仅 Electron）。 */
export async function scanThirdPartyTools(): Promise<ThirdPartyScanResult | null> {
  if (!isElectronApp() || !window.syncWeb?.scanThirdParty) {
    return null
  }
  return window.syncWeb.scanThirdParty()
}

/** 列出各智能体数据目录下的技能、记忆相关路径与配置文件（仅 Electron）。 */
export async function listAgentArtifacts(opts?: { force?: boolean }): Promise<AgentArtifactsDetail[] | null> {
  if (!isElectronApp() || !window.syncWeb?.listAgentArtifacts) {
    return null
  }
  return window.syncWeb.listAgentArtifacts(opts)
}

/** 将各智能体 Skill / Memory / Files 复制到 ~/.sync_tmp（路径镜像，保留原名；仅 Electron）。 */
export async function exportAgentArtifactsToSyncTmp(): Promise<AgentArtifactsSyncTmpExportResult | null> {
  if (!isElectronApp() || !window.syncWeb?.exportAgentArtifactsToSyncTmp) {
    return null
  }
  return window.syncWeb.exportAgentArtifactsToSyncTmp()
}

/** 检测 ~/.sync_tmp 中转目录并执行本地<->中转双向同步（仅 Electron）。 */
export async function syncAgentConfigsWithRelay(): Promise<AgentConfigSyncResult | null> {
  if (!isElectronApp() || !window.syncWeb?.syncAgentConfigsWithRelay) {
    return null
  }
  return window.syncWeb.syncAgentConfigsWithRelay()
}

/** 仅检查变更，不落盘（仅 Electron）。 */
export async function syncAgentConfigsDryRun(): Promise<AgentConfigSyncResult | null> {
  if (!isElectronApp() || !window.syncWeb?.syncAgentConfigsDryRun) {
    return null
  }
  return window.syncWeb.syncAgentConfigsDryRun()
}

/** 仅扫描 ~/.sync_tmp 是否存在可用中转目录（仅 Electron）。 */
export async function scanSyncRelayContent(): Promise<AgentConfigSyncScanResult | null> {
  if (!isElectronApp() || !window.syncWeb?.scanSyncRelayContent) {
    return null
  }
  return window.syncWeb.scanSyncRelayContent()
}

/** 按运行 ID 回滚（仅 Electron）。 */
export async function rollbackAgentConfigSync(runId: string): Promise<AgentConfigSyncRollbackResult | null> {
  if (!isElectronApp() || !window.syncWeb?.rollbackAgentConfigSync) {
    return null
  }
  return window.syncWeb.rollbackAgentConfigSync(runId)
}

/** 扫描本机 Cursor / Hermes 等 skills 下的 SKILL.md 并做简单内容分级（仅 Electron）。 */
export async function scanSkillsSecurity(): Promise<SkillsSecurityResult | null> {
  if (!isElectronApp() || !window.syncWeb?.scanSkillsSecurity) {
    return null
  }
  return window.syncWeb.scanSkillsSecurity()
}

export async function getSecurityRulesSyncStatus(): Promise<SecurityRulesSyncStatus | null> {
  if (!isElectronApp() || !window.syncWeb?.getSecurityRulesSyncStatus) {
    return null
  }
  return window.syncWeb.getSecurityRulesSyncStatus()
}

export async function getSecurityRulesPaths(): Promise<SecurityRulesPaths | null> {
  if (!isElectronApp() || !window.syncWeb?.getSecurityRulesPaths) {
    return null
  }
  return window.syncWeb.getSecurityRulesPaths()
}

/** 订阅规则库同步状态；返回卸载函数，非 Electron 时返回 null */
export function onSecurityRulesSyncStatus(
  listener: (s: SecurityRulesSyncStatus) => void
): (() => void) | null {
  if (!isElectronApp() || !window.syncWeb?.onSecurityRulesSyncStatus) {
    return null
  }
  return window.syncWeb.onSecurityRulesSyncStatus(listener)
}

export async function runThirdPartyInstall(productId: string): Promise<ThirdPartyInstallResult | null> {
  if (!isElectronApp() || !window.syncWeb?.runThirdPartyInstall) {
    return null
  }
  return window.syncWeb.runThirdPartyInstall(productId)
}

export async function openExternalUrl(url: string): Promise<boolean> {
  const u = url.trim()
  if (!/^https?:\/\//i.test(u)) {
    return false
  }
  if (isElectronApp() && window.syncWeb?.openExternal) {
    try {
      const ok = await window.syncWeb.openExternal(u)
      if (ok) {
        return true
      }
    } catch {
      /* 继续尝试 window.open */
    }
    const popped = window.open(u, '_blank', 'noopener,noreferrer')
    if (popped != null) {
      return true
    }
    window.alert(`无法在系统中打开链接，请手动复制到浏览器：\n\n${u}`)
    return false
  }
  window.open(u, '_blank', 'noopener,noreferrer')
  return true
}
