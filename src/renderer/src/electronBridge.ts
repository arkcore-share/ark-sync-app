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
