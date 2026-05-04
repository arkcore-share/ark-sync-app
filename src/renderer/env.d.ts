/// <reference types="vite/client" />

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
      getConnection: () => Promise<ConnectionPayload | null>
      setConnection: (c: ConnectionPayload) => Promise<boolean>
      clearConnection: () => Promise<boolean>
      openPath: (p: string) => Promise<string>
      showItemInFolder: (p: string) => Promise<boolean>
      syncthingRest: (p: SyncthingRestIpc) => Promise<SyncthingRestResult>
      syncthingGetAsset: (p: SyncthingAssetIpc) => Promise<SyncthingAssetResult>
    }
  }
}

export {}
