import type {
  ConnectionEntry,
  FolderConfiguration,
  FolderStatisticsEntry,
  FolderSummary
} from '../api/types'
import { sameDeviceId } from './format'

const PULL_ORDER_KEYS: Record<string, string> = {
  random: 'Ark.PullOrderRandom',
  alphabetic: 'Ark.PullOrderAlphabetic',
  smallestFirst: 'Ark.PullOrderSmallestFirst',
  largestFirst: 'Ark.PullOrderLargestFirst',
  oldestFirst: 'Ark.PullOrderOldestFirst',
  newestFirst: 'Ark.PullOrderNewestFirst'
}

const VERSIONING_TYPE_KEYS: Record<string, string> = {
  '': 'Ark.VersioningOff',
  simple: 'Ark.VersioningSimple',
  trashcan: 'Ark.VersioningTrashcan',
  staggered: 'Ark.VersioningStaggered',
  external: 'Ark.VersioningExternal'
}

const FOLDER_STATE_KEYS: Record<string, string> = {
  paused: 'Ark.FolderStatePaused',
  unknown: 'Ark.FolderStateUnknown',
  error: 'Ark.FolderStateError',
  outofsync: 'Ark.FolderStateUnsynced',
  unshared: 'Ark.FolderStateUnshared',
  uptodate: 'Ark.FolderStateUpToDate',
  scanning: 'Ark.FolderStateScanning',
  syncing: 'Ark.FolderStateSyncing'
}

const CONN_TYPE_KEYS: Record<string, string> = {
  relaywan: 'Ark.ConnectionRelayWan',
  relaylan: 'Ark.ConnectionRelayLan',
  quicwan: 'Ark.ConnectionQuicWan',
  quiclan: 'Ark.ConnectionQuicLan',
  tcpwan: 'Ark.ConnectionTcpWan',
  tcplan: 'Ark.ConnectionTcpLan',
  disconnected: 'Ark.ConnectionDisconnected'
}

const COMPRESS_KEYS: Record<string, string> = {
  always: 'Ark.CompressAllData',
  metadata: 'Ark.CompressMetadata',
  never: 'Ark.CompressNever'
}

export function folderTypeLabel(type: string, t?: (key: string) => string): string {
  const key = `Ark.FolderType${type.charAt(0).toUpperCase() + type.slice(1).replace(/[A-Z]/g, (m) => m.charAt(0) + m.slice(1).toLowerCase())}`
    .replace('sendreceive', 'SendReceive')
    .replace('sendonly', 'SendOnly')
    .replace('receiveonly', 'ReceiveOnly')
    .replace('receiveencrypted', 'ReceiveEncrypted')
  const keyMap: Record<string, string> = {
    sendreceive: 'Ark.FolderTypeSendReceive',
    sendonly: 'Ark.FolderTypeSendOnly',
    receiveonly: 'Ark.FolderTypeReceiveOnly',
    receiveencrypted: 'Ark.FolderTypeReceiveEncrypted'
  }
  const trKey = keyMap[type]
  return trKey && t ? t(trKey) : type
}

export function pullOrderLabel(order?: string, t?: (key: string) => string): string {
  const key = order ? PULL_ORDER_KEYS[order] : PULL_ORDER_KEYS.random
  return t ? t(key) : key.replace('Ark.', '')
}

export function versioningTypeLabel(vtype?: string, t?: (key: string) => string): string {
  const key = VERSIONING_TYPE_KEYS[vtype ?? ''] ?? 'Ark.VersioningOff'
  return t ? t(key) : key.replace('Ark.', '')
}

/** 与官方 `yyyy-MM-dd HH:mm:ss` 一致（本地时区） */
export function formatDateTimeYmdHms(isoOrDate: string | Date | undefined): string {
  if (!isoOrDate) {
    return '—'
  }
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  if (Number.isNaN(d.getTime())) {
    return typeof isoOrDate === 'string' ? isoOrDate : '—'
  }
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${mo}-${day} ${h}:${mi}:${s}`
}

/** 人类可读间隔：秒 → 支持 i18n */
export function formatIntervalSeconds(sec: number, t?: (key: string) => string): string {
  if (!sec || sec <= 0) {
    return '—'
  }
  const days = t?.('Ark.TimeDays') ?? 'days'
  const hours = t?.('Ark.TimeHours') ?? 'h'
  const minutes = t?.('Ark.TimeMinutes') ?? 'min'
  const seconds = t?.('Ark.TimeSeconds') ?? 'sec'
  if (sec % 86400 === 0 && sec >= 86400) {
    const d = sec / 86400
    return `${d}${days}`
  }
  if (sec % 3600 === 0 && sec >= 3600) {
    const h = sec / 3600
    return `${h}${hours}`
  }
  if (sec % 60 === 0 && sec >= 60) {
    const m = sec / 60
    return `${m}${minutes}`
  }
  return `${sec}${seconds}`
}

export function formatRescanAndWatcher(folder: FolderConfiguration, t?: (key: string) => string): string {
  const interval = folder.rescanIntervalS ?? 3600
  const intervalStr = formatIntervalSeconds(interval, t)
  const watch = folder.fsWatcherEnabled !== false
    ? (t?.('Ark.FsWatcherEnabled') ?? 'Enabled')
    : (t?.('Ark.FsWatcherDisabled') ?? 'Disabled')
  return `${intervalStr} · ${watch}`
}

/** 版本控制一行摘要（与官方类似：类型 + 参数） */
export function formatVersioningSummary(folder: FolderConfiguration, t?: (key: string) => string): string {
  const v = folder.versioning
  if (!v?.type) {
    return t?.('Ark.VersioningOff') ?? 'Off'
  }
  const typeLabel = versioningTypeLabel(v.type, t)
  const p = v.params ?? {}
  const parts: string[] = [typeLabel]

  if (v.type === 'staggered' || v.type === 'simple' || v.type === 'trashcan') {
    const maxAge = p.maxAge ? parseInt(p.maxAge, 10) : 0
    if (maxAge > 0) {
      parts.push(formatIntervalSeconds(maxAge, t))
    }
  }
  const clean = v.cleanupIntervalS
  if (clean !== undefined && clean > 0) {
    parts.push(formatIntervalSeconds(clean, t))
  }
  const vp = p.versionsPath || v.fsPath
  if (vp) {
    parts.push(vp)
  }
  return parts.join(' · ')
}

export function folderSummaryLine(
  files: number,
  dirs: number,
  bytes: number,
  formatBytes: (n: number) => string,
  t?: (key: string) => string
): string {
  const filesLabel = t?.('Ark.FolderSummaryFiles') ?? 'files'
  const dirsLabel = t?.('Ark.FolderSummaryDirs') ?? 'dirs'
  return `${files} ${filesLabel} · ${dirs} ${dirsLabel} · ${formatBytes(bytes)}`
}

/** 与官方 folderStatus 类似的展示用状态（简化） */
export function folderDisplayState(
  folder: FolderConfiguration,
  sum: FolderSummary | null,
  t?: (key: string) => string
): { label: string; ok: boolean } {
  if (folder.paused) {
    return { label: t?.('Ark.FolderStatePaused') ?? 'Paused', ok: false }
  }
  if (!sum?.state) {
    return { label: t?.('Ark.FolderStateUnknown') ?? 'Unknown', ok: false }
  }
  const st = sum.state
  if (st === 'error' || sum.error) {
    return { label: t?.('Ark.FolderStateError') ?? 'Error', ok: false }
  }
  if (st === 'idle') {
    const need = sum.needTotalItems ?? sum.needFiles + (sum.needDirectories || 0)
    if (need > 0) {
      return { label: t?.('Ark.FolderStateUnsynced') ?? 'Out of sync', ok: false }
    }
    if ((folder.devices?.length ?? 0) <= 1) {
      return { label: t?.('Ark.FolderStateUnshared') ?? 'Unshared', ok: false }
    }
    return { label: t?.('Ark.FolderStateUpToDate') ?? 'Up to date', ok: true }
  }
  if (st === 'scanning') {
    return { label: t?.('Ark.FolderStateScanning') ?? 'Scanning', ok: false }
  }
  if (st === 'syncing' || st.startsWith('sync')) {
    return { label: t?.('Ark.FolderStateSyncing') ?? 'Syncing', ok: false }
  }
  return { label: st, ok: false }
}

export function formatLastScan(stats: FolderStatisticsEntry | undefined): string {
  if (!stats?.lastScan) {
    return '—'
  }
  return formatDateTimeYmdHms(stats.lastScan)
}

/** 「最后更改」为「—」时悬停说明：尚无记录常见于路径无效、暂停、或未与对端完成索引交换 */
export const LAST_CHANGE_EMPTY_HINT =
  '尚无已完成同步的文件记录。需文件夹路径有效、未暂停，并与对端建立同步并完成索引交换；.stfolder 由本机在文件夹目录下创建，并非从中转设备接收。'

/** 兼容不同 Ark Sync 引擎 / 构建的 lastFile 字段命名 */
function coerceLastFile(
  raw: FolderStatisticsEntry['lastFile'] | undefined
): { filename: string; deleted: boolean } | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined
  }
  const o = raw as Record<string, unknown>
  const filename =
    (typeof o.filename === 'string' && o.filename) ||
    (typeof o.Filename === 'string' && o.Filename) ||
    (typeof o.fileName === 'string' && o.fileName)
  if (!filename) {
    return undefined
  }
  const deleted = o.deleted === true || o.Deleted === true
  return { filename, deleted }
}

export function formatLastChange(stats: FolderStatisticsEntry | undefined, t?: (key: string) => string): string {
  const lf = coerceLastFile(stats?.lastFile)
  if (!lf) {
    return '—'
  }
  const act = lf.deleted ? (t?.('Ark.LastChangeDeleted') ?? 'Deleted') : (t?.('Ark.LastChangeUpdated') ?? 'Updated')
  return `${act} ${lf.filename}`
}

export function formatUptimeSeconds(sec: number | undefined, t?: (key: string) => string): string {
  if (sec === undefined || sec < 0) {
    return '—'
  }
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const hLabel = t?.('Ark.UptimeHours') ?? 'h'
  const mLabel = t?.('Ark.UptimeMinutes') ?? 'm'
  const sLabel = t?.('Ark.UptimeSeconds') ?? 's'
  if (h > 0) {
    return `${h}${hLabel} ${m}${mLabel}`
  }
  if (m > 0) {
    return `${m}${mLabel} ${s}${sLabel}`
  }
  return `${s}${sLabel}`
}

export function countDiscoveryOk(discovery: Record<string, { error?: string | null }> | undefined): {
  ok: number
  total: number
} {
  if (!discovery) {
    return { ok: 0, total: 0 }
  }
  const entries = Object.values(discovery)
  const ok = entries.filter((e) => !e.error).length
  return { ok, total: entries.length }
}

export function countListenersOk(
  listeners: Record<string, { error?: string | null }> | undefined
): { ok: number; total: number } {
  if (!listeners) {
    return { ok: 0, total: 0 }
  }
  const entries = Object.values(listeners)
  const ok = entries.filter((e) => !e.error).length
  return { ok, total: entries.length }
}

/** 与官方 rdConnType 一致 */
export function rdConnType(conn: ConnectionEntry | undefined): string {
  if (!conn?.connected || !conn.type) {
    return 'disconnected'
  }
  const t = conn.type
  let base = 'disconnected'
  if (t.indexOf('relay') === 0) {
    base = 'relay'
  } else if (t.indexOf('quic') === 0) {
    base = 'quic'
  } else if (t.indexOf('tcp') === 0) {
    base = 'tcp'
  } else {
    return 'disconnected'
  }
  return conn.isLocal ? `${base}lan` : `${base}wan`
}

export function rdConnTypeLabel(conn: ConnectionEntry | undefined, t?: (key: string) => string): string {
  const k = rdConnType(conn)
  const key = CONN_TYPE_KEYS[k]
  return key && t ? t(key) : (CONN_TYPE_KEYS[k]?.replace('Ark.', '') ?? (conn?.type || '—'))
}

export function compressionLabel(c?: string, t?: (key: string) => string): string {
  if (c === 'always') {
    return t?.('Ark.CompressAllData') ?? 'All data'
  }
  if (c === 'metadata') {
    return t?.('Ark.CompressMetadata') ?? 'Metadata only'
  }
  if (c === 'never') {
    return t?.('Ark.CompressNever') ?? 'Never'
  }
  return c || '—'
}

export function sharedFolderLabels(deviceId: string, folders: FolderConfiguration[]): string {
  const names = folders
    .filter((f) => (f.devices || []).some((d) => sameDeviceId(d.deviceID, deviceId)))
    .map((f) => f.label || f.id)
  return names.join(', ')
}

/** 单文件夹 completion 切片（/db/completion?folder=&device=） */
export type FolderDeviceCompletionSlice = {
  globalBytes?: number
  needBytes?: number
  needItems?: number
  needDeletes?: number
}

/** 与官方 GUI recalcCompletion 一致的设备级汇总 */
export type DeviceCompletionAggregate = {
  completion: number
  needBytes: number
  needItems: number
  /** 是否至少成功拉取到一个共享文件夹的 completion */
  loaded?: boolean
}

export function aggregateDeviceCompletion(
  slices: FolderDeviceCompletionSlice[]
): DeviceCompletionAggregate {
  let total = 0
  let needed = 0
  let items = 0
  let deletes = 0
  for (const s of slices) {
    total += s.globalBytes ?? 0
    needed += s.needBytes ?? 0
    items += s.needItems ?? 0
    deletes += s.needDeletes ?? 0
  }
  const loaded = slices.length > 0
  if (total === 0) {
    return { completion: 100, needBytes: 0, needItems: 0, loaded }
  }
  let completion = Math.floor(100 * (1 - needed / total))
  const needItems = items + deletes
  if (needed === 0 && needItems > 0) {
    completion = 95
  }
  return { completion, needBytes: needed, needItems, loaded }
}

/** 本机共享文件夹的待同步量（/db/status），用于本机正在拉取数据时的展示 */
export function aggregateLocalFolderSyncNeed(
  statuses: FolderSummary[]
): DeviceCompletionAggregate {
  let globalBytes = 0
  let needBytes = 0
  let needItems = 0
  for (const s of statuses) {
    globalBytes += s.globalBytes ?? 0
    needBytes += s.needBytes ?? 0
    needItems +=
      s.needTotalItems ?? (s.needFiles ?? 0) + (s.needDirectories ?? 0)
  }
  if (needItems === 0 && needBytes === 0) {
    return { completion: 100, needBytes: 0, needItems: 0, loaded: true }
  }
  let completion: number
  if ((needBytes === 0 && needItems > 0) || globalBytes === 0) {
    completion = 95
  } else {
    completion = Math.floor(100 * (1 - needBytes / globalBytes))
  }
  return { completion, needBytes, needItems, loaded: true }
}

function folderHasLocalSyncActivity(status: FolderSummary): boolean {
  const st = status.state ?? ''
  if (st === 'syncing' || st === 'scanning' || st.startsWith('sync')) {
    return true
  }
  if ((status.needBytes ?? 0) > 0) {
    return true
  }
  const items =
    status.needTotalItems ??
    (status.needFiles ?? 0) + (status.needDirectories ?? 0)
  return items > 0
}

/**
 * 合并「远程设备完成度」与「本机文件夹同步状态」。
 * 官方 remote 卡片语义是「对端还差多少」；本机正在下载时 remote 可能已是 100%，
 * 此时用本机 folder status 展示同步中（与用户在下载端看到的活动一致）。
 */
export function mergeDeviceDisplayCompletion(
  remote: DeviceCompletionAggregate,
  localStatuses: FolderSummary[],
  sharedFolderCount: number
): DeviceCompletionAggregate {
  const remoteInSync =
    remote.loaded !== false &&
    remote.completion === 100 &&
    remote.needBytes === 0 &&
    remote.needItems === 0

  const localActive = localStatuses.some(folderHasLocalSyncActivity)

  if (!remoteInSync) {
    return remote
  }

  if (localActive) {
    return aggregateLocalFolderSyncNeed(localStatuses)
  }

  if (remote.loaded === false && sharedFolderCount > 0) {
    return { completion: 100, needBytes: 0, needItems: 0, loaded: false }
  }

  return remote
}

export function foldersSharedWithDevice(
  deviceId: string,
  folders: FolderConfiguration[]
): FolderConfiguration[] {
  return folders.filter((f) => (f.devices ?? []).some((d) => sameDeviceId(d.deviceID, deviceId)))
}
