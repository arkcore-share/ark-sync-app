import { isElectronApp, syncthingGetAsset, syncthingRest } from '../electronBridge'
import { isLocalSyncthingBase } from '../util/isLocalSyncthing'
import type {
  ConnectionsResponse,
  DbIgnoresResponse,
  DeviceConfiguration,
  DeviceStatisticsEntry,
  FolderConfiguration,
  FolderStatisticsEntry,
  FolderSummary,
  FolderVersionsMap,
  LdapConfiguration,
  PendingClusterDeviceEntry,
  PendingClusterFolderEntry,
  SyncthingDiskEvent,
  SystemConfig,
  SystemStatus
} from './types'

export type ClientOptions = {
  baseUrl: string
  apiKey: string
  rejectUnauthorized?: boolean
  /** Electron + 本机：无 GUI 密码时用主进程 CSRF 会话 */
  localSession?: boolean
  /** Electron：GUI 账户（静态密码或 LDAP），走主进程 Basic + CSRF */
  guiUser?: string
  guiPassword?: string
}

function normalizeBase(url: string): string {
  const u = url.trim().replace(/\/$/, '')
  return u.endsWith('/rest') ? u.slice(0, -5) : u
}

function normalizePendingMap(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  return {}
}

export class SyncthingClient {
  private base: string
  private apiKey: string
  private rejectUnauthorized: boolean
  private localSession: boolean
  private guiUser: string
  private guiPassword: string

  constructor(opts: ClientOptions) {
    this.base = normalizeBase(opts.baseUrl)
    this.apiKey = opts.apiKey.trim()
    this.rejectUnauthorized = opts.rejectUnauthorized !== false
    this.localSession = opts.localSession === true
    this.guiUser = (opts.guiUser ?? '').trim()
    this.guiPassword = opts.guiPassword ?? ''
  }

  private ipcAuth(): {
    baseUrl: string
    apiKey: string
    rejectUnauthorized: boolean
    localSession: boolean
    guiUser?: string
    guiPassword?: string
  } {
    return {
      baseUrl: this.base,
      apiKey: this.apiKey,
      rejectUnauthorized: this.rejectUnauthorized,
      localSession: this.localSession,
      ...(this.guiUser ? { guiUser: this.guiUser, guiPassword: this.guiPassword } : {})
    }
  }

  private useIpc(): boolean {
    if (!isElectronApp() || this.apiKey !== '') {
      return false
    }
    if (this.guiUser) {
      return true
    }
    return this.localSession && isLocalSyncthingBase(this.base)
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | undefined>
  ): Promise<T> {
    const restPath = path.startsWith('/') ? path : `/${path}`
    const q = query
      ? Object.fromEntries(
          Object.entries(query).filter(([, v]) => v !== undefined) as [string, string][]
        )
      : undefined

    if (this.useIpc()) {
      const res = await syncthingRest({
        ...this.ipcAuth(),
        method,
        restPath,
        query: q,
        body
      })
      if (res.error) {
        throw new Error(res.error)
      }
      if (!res.ok) {
        const detail = res.text ?? (res.json !== undefined ? JSON.stringify(res.json) : '') ?? ''
        throw new Error(`HTTP ${res.statusCode} ${detail}`.trim())
      }
      if (res.statusCode === 204) {
        return undefined as T
      }
      if (res.json !== undefined) {
        return res.json as T
      }
      return undefined as T
    }

    if (this.guiUser && !isElectronApp()) {
      throw new Error('已保存 GUI 账户登录：请使用 Electron 桌面窗口打开本应用，或改用 API 密钥。')
    }

    if (!this.apiKey) {
      throw new Error(
        '请填写 API 密钥；若为本机且无 GUI 密码，请在 Electron 中勾选「本机免密钥」；若使用 GUI 密码/LDAP，请填写 GUI 用户名与密码。'
      )
    }

    const qs = q ? '?' + new URLSearchParams(q).toString() : ''
    const url = `${this.base}/rest${restPath}${qs}`

    const init: RequestInit = {
      method,
      headers: {
        'X-API-Key': this.apiKey,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    }

    const fetchRes = await fetch(url, init)
    if (!fetchRes.ok) {
      const text = await fetchRes.text().catch(() => '')
      throw new Error(`${fetchRes.status} ${fetchRes.statusText}${text ? `: ${text}` : ''}`)
    }
    if (fetchRes.status === 204) {
      return undefined as T
    }
    const ct = fetchRes.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      return (await fetchRes.json()) as T
    }
    return undefined as T
  }

  async ping(): Promise<{ ping: string }> {
    return this.request('GET', '/system/ping')
  }

  async systemStatus(): Promise<SystemStatus> {
    return this.request('GET', '/system/status')
  }

  async systemVersion(): Promise<{ version: string; longVersion: string }> {
    return this.request('GET', '/system/version')
  }

  async systemErrors(): Promise<{ errors: { when: string; message: string }[] }> {
    return this.request('GET', '/system/error')
  }

  async clearErrors(): Promise<void> {
    await this.request('POST', '/system/error/clear')
  }

  async connections(): Promise<ConnectionsResponse> {
    return this.request('GET', '/system/connections')
  }

  /** 磁盘变更事件（与官方「最近更改」相同数据源）；`timeout=0` 避免长时间阻塞。 */
  async getDiskEvents(options?: { limit?: number; timeout?: number }): Promise<SyncthingDiskEvent[]> {
    const limit = options?.limit ?? 25
    const timeout = options?.timeout ?? 0
    const res = await this.request<unknown>('GET', '/events/disk', undefined, {
      limit: String(limit),
      timeout: String(timeout)
    })
    if (!Array.isArray(res)) {
      return []
    }
    return res as SyncthingDiskEvent[]
  }

  async getConfig(): Promise<SystemConfig> {
    return this.request('GET', '/system/config')
  }

  async setConfig(cfg: SystemConfig): Promise<void> {
    await this.request('PUT', '/system/config', cfg)
  }

  async getConfigOptions(): Promise<Record<string, unknown>> {
    return this.request('GET', '/config/options')
  }

  async patchConfigOptions(partial: Record<string, unknown>): Promise<void> {
    await this.request('PATCH', '/config/options', partial)
  }

  async getLdapConfig(): Promise<LdapConfiguration> {
    return this.request('GET', '/config/ldap')
  }

  async putLdapConfig(cfg: LdapConfiguration): Promise<void> {
    await this.request('PUT', '/config/ldap', cfg)
  }

  async getFolderStatisticsMap(): Promise<Record<string, FolderStatisticsEntry>> {
    return this.request('GET', '/stats/folder')
  }

  async getDeviceStatisticsMap(): Promise<Record<string, DeviceStatisticsEntry>> {
    return this.request('GET', '/stats/device')
  }

  async getDbIgnores(folder: string): Promise<DbIgnoresResponse> {
    return this.request('GET', '/db/ignores', undefined, { folder })
  }

  async setDbIgnores(folder: string, lines: string[]): Promise<DbIgnoresResponse> {
    return this.request('POST', '/db/ignores', { ignore: lines }, { folder })
  }

  async getFolderVersions(folder: string): Promise<FolderVersionsMap> {
    return this.request('GET', '/folder/versions', undefined, { folder })
  }

  /** `versions` maps relative file path → version time (RFC3339 or Syncthing time string) */
  async restoreFolderVersions(folder: string, versions: Record<string, string>): Promise<Record<string, string>> {
    return this.request('POST', '/folder/versions', versions, { folder })
  }

  async getUsageReportPreview(version?: number): Promise<Record<string, unknown>> {
    return this.request('GET', '/svc/report', undefined, version ? { version: String(version) } : undefined)
  }

  async getQrDataUrl(text: string): Promise<string> {
    const assetPath = '/qr/'
    const query = { text }
    if (this.useIpc()) {
      const res = await syncthingGetAsset({
        ...this.ipcAuth(),
        assetPath,
        query
      })
      if (!res.ok || res.base64 === undefined) {
        throw new Error(res.error || '无法获取二维码')
      }
      const ct = res.contentType || 'image/png'
      return `data:${ct};base64,${res.base64}`
    }
    if (!this.apiKey) {
      throw new Error('获取二维码需要 API 密钥，或使用 Electron 并配置本机会话 / GUI 登录')
    }
    const qs = new URLSearchParams(query).toString()
    const url = `${this.base}${assetPath}?${qs}`
    const fetchRes = await fetch(url, {
      headers: { 'X-API-Key': this.apiKey }
    })
    if (!fetchRes.ok) {
      throw new Error(`QR ${fetchRes.status}`)
    }
    const buf = await fetchRes.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    const b64 = btoa(binary)
    const ct = fetchRes.headers.get('content-type') || 'image/png'
    return `data:${ct};base64,${b64}`
  }

  async folderStatus(folder: string): Promise<FolderSummary> {
    return this.request('GET', '/db/status', undefined, { folder })
  }

  /** 与某远程设备在所有共享文件夹上的汇总完成度（folder 省略） */
  async getDeviceCompletion(deviceId: string): Promise<{
    completion: number
    needItems?: number
    needBytes?: number
    globalBytes?: number
  }> {
    return this.request('GET', '/db/completion', undefined, { device: deviceId })
  }

  /** 某远程设备在指定文件夹上的完成度 */
  async getFolderDeviceCompletion(
    folder: string,
    device: string
  ): Promise<{
    completion: number
    needItems?: number
    needBytes?: number
    globalBytes?: number
  }> {
    return this.request('GET', '/db/completion', undefined, { folder, device })
  }

  async scanFolder(folder: string, sub?: string): Promise<void> {
    await this.request(
      'POST',
      '/db/scan',
      undefined,
      sub ? { folder, sub } : { folder }
    )
  }

  /** 触发所有文件夹重新扫描（与官方「全部重新扫描」一致，不带 folder 参数） */
  async scanAllFolders(): Promise<void> {
    await this.request('POST', '/db/scan')
  }

  async setAllFoldersPaused(paused: boolean): Promise<void> {
    const cfg = await this.getConfig()
    for (const f of cfg.folders) {
      await this.putFolder({ ...f, paused })
    }
  }

  async setFolderPaused(folderId: string, paused: boolean): Promise<void> {
    const cfg = await this.getConfig()
    const f = cfg.folders.find((x) => x.id === folderId)
    if (!f) {
      throw new Error('folder not found')
    }
    await this.putFolder({ ...f, paused })
  }

  async pauseDevice(device: string): Promise<void> {
    await this.request('POST', '/system/pause', undefined, { device })
  }

  async resumeDevice(device: string): Promise<void> {
    await this.request('POST', '/system/resume', undefined, { device })
  }

  async restart(): Promise<void> {
    await this.request('POST', '/system/restart')
  }

  async shutdown(): Promise<void> {
    await this.request('POST', '/system/shutdown')
  }

  async putFolder(folder: FolderConfiguration): Promise<void> {
    await this.request('PUT', `/config/folders/${encodeURIComponent(folder.id)}`, folder)
  }

  async deleteFolder(id: string): Promise<void> {
    await this.request('DELETE', `/config/folders/${encodeURIComponent(id)}`)
  }

  async putDevice(device: DeviceConfiguration): Promise<void> {
    await this.request('PUT', `/config/devices/${encodeURIComponent(device.deviceID)}`, device)
  }

  async getConfigDevice(deviceId: string): Promise<DeviceConfiguration> {
    return this.request('GET', `/config/devices/${encodeURIComponent(deviceId)}`)
  }

  async deleteDevice(id: string): Promise<void> {
    await this.request('DELETE', `/config/devices/${encodeURIComponent(id)}`)
  }

  /** 待处理的新设备连接请求（含中转/中继场景），键为设备 ID */
  async pendingDevices(): Promise<Record<string, PendingClusterDeviceEntry>> {
    const raw = await this.request<unknown>('GET', '/cluster/pending/devices')
    return normalizePendingMap(raw) as Record<string, PendingClusterDeviceEntry>
  }

  /** 待处理的共享文件夹提议 */
  async pendingFolders(): Promise<Record<string, PendingClusterFolderEntry>> {
    const raw = await this.request<unknown>('GET', '/cluster/pending/folders')
    return normalizePendingMap(raw) as Record<string, PendingClusterFolderEntry>
  }

  /** POST /rest/config/defaults/device — 新建设备默认值（与官方「添加设备」一致） */
  async getDeviceDefaults(): Promise<DeviceConfiguration> {
    return this.request('GET', '/config/defaults/device')
  }

  /** GET /rest/config/defaults/folder — 新建文件夹默认值（与官方 pending 自动接受一致） */
  async getFolderDefaults(): Promise<FolderConfiguration> {
    return this.request('GET', '/config/defaults/folder')
  }

  /** 从待处理列表移除设备（不加入忽略列表，通知可能再次出现） */
  async dismissPendingDevice(deviceId: string): Promise<void> {
    await this.request('DELETE', '/cluster/pending/devices', undefined, { device: deviceId })
  }

  async dismissPendingFolder(folderId: string, deviceId: string): Promise<void> {
    await this.request('DELETE', '/cluster/pending/folders', undefined, {
      folder: folderId,
      device: deviceId
    })
  }

  async browseFolder(current?: string): Promise<string[]> {
    return this.request('GET', '/system/browse', undefined, current ? { current } : undefined)
  }
}

export async function testConnection(opts: ClientOptions): Promise<void> {
  const c = new SyncthingClient(opts)
  await c.systemStatus()
}
