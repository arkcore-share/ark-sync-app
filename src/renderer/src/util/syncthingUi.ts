import type {
  ConnectionEntry,
  FolderConfiguration,
  FolderStatisticsEntry,
  FolderSummary
} from '../api/types'
import { sameDeviceId } from './format'

const FOLDER_TYPE_CN: Record<string, string> = {
  sendreceive: '发送和接收',
  sendonly: '仅发送',
  receiveonly: '仅接收',
  receiveencrypted: '接收加密'
}

const PULL_ORDER_CN: Record<string, string> = {
  random: '随机',
  alphabetic: '按字母顺序',
  smallestFirst: '最小优先',
  largestFirst: '最大优先',
  oldestFirst: '最旧优先',
  newestFirst: '最新优先'
}

const VERSIONING_TYPE_CN: Record<string, string> = {
  '': '关闭',
  simple: '简易',
  trashcan: '回收站',
  staggered: '阶段',
  external: '外部'
}

export function folderTypeLabel(t: string): string {
  return FOLDER_TYPE_CN[t] ?? t
}

export function pullOrderLabel(order?: string): string {
  if (!order) {
    return PULL_ORDER_CN.random
  }
  return PULL_ORDER_CN[order] ?? order
}

export function versioningTypeLabel(t?: string): string {
  if (!t) {
    return '关闭'
  }
  return VERSIONING_TYPE_CN[t] ?? t
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

/** 人类可读间隔：秒 → 中文 */
export function formatIntervalSeconds(sec: number): string {
  if (!sec || sec <= 0) {
    return '—'
  }
  if (sec % 86400 === 0 && sec >= 86400) {
    const d = sec / 86400
    return `${d}天`
  }
  if (sec % 3600 === 0 && sec >= 3600) {
    const h = sec / 3600
    return `${h}时`
  }
  if (sec % 60 === 0 && sec >= 60) {
    const m = sec / 60
    return `${m}分`
  }
  return `${sec}秒`
}

export function formatRescanAndWatcher(folder: FolderConfiguration): string {
  const interval = folder.rescanIntervalS ?? 3600
  const intervalStr = formatIntervalSeconds(interval)
  const watch = folder.fsWatcherEnabled !== false ? '已启用' : '已禁用'
  return `${intervalStr} · ${watch}`
}

/** 版本控制一行摘要（与官方类似：类型 + 参数） */
export function formatVersioningSummary(folder: FolderConfiguration): string {
  const v = folder.versioning
  if (!v?.type) {
    return '关闭'
  }
  const typeCn = versioningTypeLabel(v.type)
  const p = v.params ?? {}
  const parts: string[] = [typeCn]

  if (v.type === 'staggered' || v.type === 'simple' || v.type === 'trashcan') {
    const maxAge = p.maxAge ? parseInt(p.maxAge, 10) : 0
    if (maxAge > 0) {
      parts.push(formatIntervalSeconds(maxAge))
    }
  }
  const clean = v.cleanupIntervalS
  if (clean !== undefined && clean > 0) {
    parts.push(formatIntervalSeconds(clean))
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
  formatBytes: (n: number) => string
): string {
  return `${files} 个文件 · ${dirs} 个目录 · ${formatBytes(bytes)}`
}

/** 与官方 folderStatus 类似的展示用状态（简化） */
export function folderDisplayState(
  folder: FolderConfiguration,
  sum: FolderSummary | null
): { label: string; ok: boolean } {
  if (folder.paused) {
    return { label: '已暂停', ok: false }
  }
  if (!sum?.state) {
    return { label: '未知', ok: false }
  }
  const st = sum.state
  if (st === 'error' || sum.error) {
    return { label: '错误', ok: false }
  }
  if (st === 'idle') {
    const need = sum.needTotalItems ?? sum.needFiles + (sum.needDirectories || 0)
    if (need > 0) {
      return { label: '不同步', ok: false }
    }
    if ((folder.devices?.length ?? 0) <= 1) {
      return { label: '未共享', ok: false }
    }
    return { label: '最新', ok: true }
  }
  if (st === 'scanning') {
    return { label: '扫描中', ok: false }
  }
  if (st === 'syncing' || st.startsWith('sync')) {
    return { label: '同步中', ok: false }
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

/** 兼容不同 Syncthing / 构建的 lastFile 字段命名 */
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

export function formatLastChange(stats: FolderStatisticsEntry | undefined): string {
  const lf = coerceLastFile(stats?.lastFile)
  if (!lf) {
    return '—'
  }
  const act = lf.deleted ? '已删除' : '已更新'
  return `${act} ${lf.filename}`
}

export function formatUptimeSeconds(sec: number | undefined): string {
  if (sec === undefined || sec < 0) {
    return '—'
  }
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) {
    return `${h}时 ${m}分`
  }
  if (m > 0) {
    return `${m}分 ${s}秒`
  }
  return `${s}秒`
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

const RD_CONN_CN: Record<string, string> = {
  relaywan: '中继广域网',
  relaylan: '中继局域网',
  quicwan: 'QUIC 广域网',
  quiclan: 'QUIC 局域网',
  tcpwan: 'TCP 广域网',
  tcplan: 'TCP 局域网',
  disconnected: '未连接'
}

export function rdConnTypeLabelCn(conn: ConnectionEntry | undefined): string {
  const k = rdConnType(conn)
  return RD_CONN_CN[k] ?? (conn?.type || '—')
}

export function compressionLabelCn(c?: string): string {
  if (c === 'always') {
    return '全部数据'
  }
  if (c === 'metadata') {
    return '仅元数据'
  }
  if (c === 'never') {
    return '关闭'
  }
  return c || '—'
}

export function sharedFolderLabels(deviceId: string, folders: FolderConfiguration[]): string {
  const names = folders
    .filter((f) => (f.devices || []).some((d) => sameDeviceId(d.deviceID, deviceId)))
    .map((f) => f.label || f.id)
  return names.join(', ')
}
