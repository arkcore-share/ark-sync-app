/// <reference types="vite/client" />

declare const __APP_VERSION__: string

export type SyncthingRestIpc = {
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

export type SyncthingAssetIpc = {
  baseUrl: string
  apiKey: string
  rejectUnauthorized: boolean
  localSession: boolean
  guiUser?: string
  guiPassword?: string
  assetPath: string
  query: Record<string, string>
}

export type SyncthingAssetResult = {
  ok: boolean
  statusCode?: number
  base64?: string
  contentType?: string
  error?: string
}

export type SyncthingRestResult = {
  ok: boolean
  statusCode: number
  json?: unknown
  text?: string
  /** 非 JSON 二进制响应（如 support bundle zip） */
  base64?: string
  contentType?: string
  error?: string
}

export type ConnectionPayload = {
  baseUrl: string
  apiKey: string
  rejectUnauthorized: boolean
  /** Electron：本机且无 GUI 密码时，用主进程 CSRF 会话代替 API 密钥 */
  localSession?: boolean
  /** Electron：GUI 静态密码或 LDAP 时使用 HTTP Basic + CSRF（密码存于本机用户数据） */
  guiUser?: string
  guiPassword?: string
}

declare global {
  interface Window {
    /** Present only when running inside Electron (preload). */
    syncWeb?: {
      electronPlatform?: NodeJS.Platform
      windowMinimize?: () => Promise<void>
      windowMaximizeToggle?: () => Promise<boolean>
      windowClose?: () => Promise<void>
      windowIsMaximized?: () => Promise<boolean>
      onWindowMaximized?: (listener: (maximized: boolean) => void) => () => void
      getConnection: () => Promise<ConnectionPayload | null>
      setConnection: (c: ConnectionPayload) => Promise<boolean>
      clearConnection: () => Promise<boolean>
      openPath: (p: string) => Promise<string>
      showItemInFolder: (p: string) => Promise<boolean>
      openExternal: (url: string) => Promise<boolean>
      syncthingRest: (p: SyncthingRestIpc) => Promise<SyncthingRestResult>
      syncthingGetAsset: (p: SyncthingAssetIpc) => Promise<SyncthingAssetResult>
      restartApp?: () => Promise<void>
      quitApp?: () => Promise<void>
      onTrayCommand?: (listener: (cmd: import('../shared/trayCommand.js').TrayCommand) => void) => () => void
      scanThirdParty?: () => Promise<import('../shared/thirdPartyScanTypes.js').ThirdPartyScanResult>
      listAgentArtifacts?: (opts?: {
        force?: boolean
      }) => Promise<import('../shared/agentArtifactsTypes.js').AgentArtifactsDetail[]>
      exportAgentArtifactsToSyncTmp?: () => Promise<
        import('../shared/agentArtifactsTypes.js').AgentArtifactsSyncTmpExportResult
      >
      syncAgentConfigsWithRelay?: () => Promise<
        import('../shared/agentArtifactsTypes.js').AgentConfigSyncResult
      >
      syncAgentConfigsDryRun?: () => Promise<
        import('../shared/agentArtifactsTypes.js').AgentConfigSyncResult
      >
      scanSyncRelayContent?: () => Promise<
        import('../shared/agentArtifactsTypes.js').AgentConfigSyncScanResult
      >
      rollbackAgentConfigSync?: (
        runId: string
      ) => Promise<import('../shared/agentArtifactsTypes.js').AgentConfigSyncRollbackResult>
      scanSkillsSecurity?: () => Promise<import('../shared/skillsSecurityTypes.js').SkillsSecurityResult>
      getSecurityRulesSyncStatus?: () => Promise<import('../shared/securityRulesSyncTypes.js').SecurityRulesSyncStatus>
      getSecurityRulesPaths?: () => Promise<import('../shared/securityRulesSyncTypes.js').SecurityRulesPaths>
      onSecurityRulesSyncStatus?: (
        listener: (s: import('../shared/securityRulesSyncTypes.js').SecurityRulesSyncStatus) => void
      ) => () => void
      runThirdPartyInstall?: (
        productId: string
      ) => Promise<import('../shared/thirdPartyInstallTypes.js').ThirdPartyInstallResult>
    }
  }
}

export {}
