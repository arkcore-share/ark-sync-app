import { contextBridge, ipcRenderer } from 'electron'
import type { TrayCommand } from '../shared/trayCommand.js'
import type { ThirdPartyScanResult } from '../shared/thirdPartyScanTypes.js'
import type { SecurityRulesPaths, SecurityRulesSyncStatus } from '../shared/securityRulesSyncTypes.js'
import type { SkillsSecurityResult } from '../shared/skillsSecurityTypes.js'
import type {
  AgentArtifactsDetail,
  AgentArtifactsSyncTmpExportResult,
  AgentConfigSyncResult,
  AgentConfigSyncRollbackResult,
  AgentConfigSyncScanResult
} from '../shared/agentArtifactsTypes.js'
import type { ThirdPartyInstallResult } from '../shared/thirdPartyInstallTypes.js'

export type ConnectionPayload = {
  baseUrl: string
  apiKey: string
  rejectUnauthorized: boolean
  localSession?: boolean
  guiUser?: string
  guiPassword?: string
}

contextBridge.exposeInMainWorld('syncWeb', {
  /** Node process.platform，用于渲染进程按平台留出标题栏/红绿灯区域 */
  electronPlatform: process.platform,
  windowMinimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  windowMaximizeToggle: (): Promise<boolean> => ipcRenderer.invoke('window:maximizeToggle'),
  windowClose: (): Promise<void> => ipcRenderer.invoke('window:close'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  onWindowMaximized: (listener: (maximized: boolean) => void): (() => void) => {
    const handler = (_e: unknown, maximized: boolean): void => {
      listener(maximized)
    }
    ipcRenderer.on('window:maximized', handler)
    return () => ipcRenderer.removeListener('window:maximized', handler)
  },
  getConnection: (): Promise<ConnectionPayload | null> => ipcRenderer.invoke('connection:get'),
  setConnection: (c: ConnectionPayload): Promise<boolean> => ipcRenderer.invoke('connection:set', c),
  clearConnection: (): Promise<boolean> => ipcRenderer.invoke('connection:clear'),
  openPath: (p: string): Promise<string> => ipcRenderer.invoke('shell:openPath', p),
  showItemInFolder: (p: string): Promise<boolean> => ipcRenderer.invoke('shell:showItemInFolder', p),
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('shell:openExternal', url),
  syncthingRest: (p: Record<string, unknown>): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('syncthing:rest', p),
  syncthingGetAsset: (p: Record<string, unknown>): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('syncthing:getAsset', p),
  restartApp: (): Promise<void> => ipcRenderer.invoke('app:restart'),
  quitApp: (): Promise<void> => ipcRenderer.invoke('app:quit'),
  setTrayLocale: (code: string): Promise<boolean> => ipcRenderer.invoke('app:setTrayLocale', code),
  onTrayCommand: (listener: (cmd: TrayCommand) => void): (() => void) => {
    const handler = (_e: unknown, cmd: TrayCommand): void => {
      listener(cmd)
    }
    ipcRenderer.on('app:tray-command', handler)
    return () => ipcRenderer.removeListener('app:tray-command', handler)
  },
  scanThirdParty: (): Promise<ThirdPartyScanResult> => ipcRenderer.invoke('env:scanThirdParty'),
  listAgentArtifacts: (opts?: { force?: boolean }): Promise<AgentArtifactsDetail[]> =>
    ipcRenderer.invoke('env:listAgentArtifacts', opts ?? {}),
  exportAgentArtifactsToSyncTmp: (): Promise<AgentArtifactsSyncTmpExportResult> =>
    ipcRenderer.invoke('env:exportAgentArtifactsToSyncTmp'),
  syncAgentConfigsWithRelay: (): Promise<AgentConfigSyncResult> =>
    ipcRenderer.invoke('env:syncAgentConfigsWithRelay'),
  syncAgentConfigsDryRun: (): Promise<AgentConfigSyncResult> =>
    ipcRenderer.invoke('env:syncAgentConfigsDryRun'),
  scanSyncRelayContent: (): Promise<AgentConfigSyncScanResult> =>
    ipcRenderer.invoke('env:scanSyncRelayContent'),
  rollbackAgentConfigSync: (runId: string): Promise<AgentConfigSyncRollbackResult> =>
    ipcRenderer.invoke('env:rollbackAgentConfigSync', runId),
  scanSkillsSecurity: (): Promise<SkillsSecurityResult> => ipcRenderer.invoke('env:scanSkillsSecurity'),
  getSecurityRulesSyncStatus: (): Promise<SecurityRulesSyncStatus> =>
    ipcRenderer.invoke('env:getSecurityRulesSyncStatus'),
  getSecurityRulesPaths: (): Promise<SecurityRulesPaths> => ipcRenderer.invoke('env:getSecurityRulesPaths'),
  onSecurityRulesSyncStatus: (listener: (s: SecurityRulesSyncStatus) => void): (() => void) => {
    const handler = (_e: unknown, s: SecurityRulesSyncStatus): void => {
      listener(s)
    }
    ipcRenderer.on('env:security-rules-sync-status', handler)
    return () => ipcRenderer.removeListener('env:security-rules-sync-status', handler)
  },
  runThirdPartyInstall: (productId: string): Promise<ThirdPartyInstallResult> =>
    ipcRenderer.invoke('env:installThirdParty', productId)
})
