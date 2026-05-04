import type { FolderConfiguration } from '../../api/types'

export type FolderModalTabId = 'general' | 'sharing' | 'versioning' | 'ignores' | 'advanced'

export const FOLDER_MODAL_TABS: { id: FolderModalTabId; label: string; glyph: string }[] = [
  { id: 'general', label: '常规', glyph: '⚙' },
  { id: 'sharing', label: '共享', glyph: '⎘' },
  { id: 'versioning', label: '文件版本控制', glyph: '📋' },
  { id: 'ignores', label: '忽略模式', glyph: '⏚' },
  { id: 'advanced', label: '高级', glyph: '⛭' }
]

export const PULL_ORDERS = [
  'random',
  'alphabetic',
  'smallestFirst',
  'largestFirst',
  'oldestFirst',
  'newestFirst'
] as const

export const VERSIONING_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '不启用文件版本控制' },
  { value: 'simple', label: '简易文件版本控制' },
  { value: 'trashcan', label: '回收站式文件版本控制' },
  { value: 'staggered', label: '阶段文件版本控制' },
  { value: 'external', label: '外部文件版本控制' }
]

export const MIN_DISK_UNITS = ['%', 'KiB', 'MiB', 'GiB', 'TiB', 'B'] as const

export type MinDiskUnit = (typeof MIN_DISK_UNITS)[number]

export const STAGGERED_HELP_P1 =
  '当 Syncthing 替换或删除文件时，文件将移动到 .stversions 目录中，文件名带有日期戳版本。'

/** 接在 P1 之后、间隔规则之前 */
export const STAGGERED_HELP_P1B =
  '超过最长保留时间，或者不满足下列条件的历史版本，则会自动删除。'

export const STAGGERED_HELP_P2 =
  '使用以下间隔：最近一小时内的历史版本，更新间隔小于三十秒的仅保留一份。最近一天内的历史版本，更新间隔小于一小时的仅保留一份。最近一个月内的历史版本，更新间隔小于一天的仅保留一份。距离现在超过一个月且小于最长保留时间的，更新间隔小于一周的仅保留一份。'

export const VERSIONING_DOC = 'https://docs.syncthing.net/users/versioning.html'
export const IGNORE_DOC = 'https://docs.syncthing.net/users/ignoring.html'

export const IGNORE_GUIDE_ROWS: { chip: string; text: string }[] = [
  { chip: '(?d)', text: '此前缀表示，如果文件阻止删除目录则文件可被删除。' },
  { chip: '(?i)', text: '此前缀表示，后面的模式在匹配时不区分大小写。' },
  { chip: '!', text: '给定条件的反转（即不排除）。' },
  { chip: '*', text: '单级通配符（仅匹配单层文件夹）。' },
  { chip: '**', text: '多级通配符（用以匹配多层文件夹）。' },
  { chip: '//', text: '注释，在行首使用。' }
]

export function generateFolderId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let a = ''
  let b = ''
  for (let i = 0; i < 7; i++) {
    a += chars[Math.floor(Math.random() * chars.length)]
  }
  for (let i = 0; i < 5; i++) {
    b += chars[Math.floor(Math.random() * chars.length)]
  }
  return `${a}-${b}`
}

function versioningParamsRecord(params: unknown): Record<string, string> | undefined {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return undefined
  }
  return params as Record<string, string>
}

export function parseStaggeredMaxAgeDays(params: unknown): number {
  const p = versioningParamsRecord(params)
  const raw = p?.maxAge
  if (raw == null || raw === '') {
    return 365
  }
  const sec = parseInt(String(raw), 10)
  if (!Number.isFinite(sec) || sec <= 0) {
    return 365
  }
  return Math.max(1, Math.round(sec / 86400))
}

export function parseSimpleKeep(params: unknown): number {
  const p = versioningParamsRecord(params)
  const n = parseInt(String(p?.keep ?? '5'), 10)
  return Number.isFinite(n) && n >= 0 ? n : 5
}

export function parseTrashDays(params: unknown): number {
  const p = versioningParamsRecord(params)
  const n = parseInt(String(p?.cleanoutDays ?? '30'), 10)
  return Number.isFinite(n) && n >= 0 ? n : 30
}

export function parseMinDiskFree(s: unknown): { n: string; unit: MinDiskUnit } {
  if (s == null || (typeof s === 'string' && !s.trim())) {
    return { n: '1', unit: '%' }
  }
  const t = typeof s === 'string' ? s.trim() : String(s).trim()
  if (!t) {
    return { n: '1', unit: '%' }
  }
  const parts = t.split(/\s+/)
  if (parts.length >= 2) {
    const unit = parts[parts.length - 1] as MinDiskUnit
    const n = parts.slice(0, -1).join(' ')
    if (MIN_DISK_UNITS.includes(unit)) {
      return { n: n || '1', unit }
    }
  }
  const m = t.match(/^([\d.]+)\s*(%|KiB|MiB|GiB|TiB|B)$/i)
  if (m) {
    const u = m[2] as MinDiskUnit
    return { n: m[1], unit: MIN_DISK_UNITS.includes(u) ? u : '%' }
  }
  return { n: '1', unit: '%' }
}

export function combineMinDiskFree(n: string, unit: string): string | undefined {
  const num = n.trim()
  if (!num) {
    return undefined
  }
  return `${num} ${unit}`.trim()
}

const FOLDER_TYPES_FOR_UI: readonly FolderConfiguration['type'][] = [
  'sendreceive',
  'sendonly',
  'receiveonly',
  'receiveencrypted'
]

export function normalizeFolderType(t: FolderConfiguration['type'] | undefined): FolderConfiguration['type'] {
  if (t && (FOLDER_TYPES_FOR_UI as readonly string[]).includes(t)) {
    return t
  }
  return 'sendreceive'
}

export function cloneFolder(f: FolderConfiguration): FolderConfiguration {
  const c = JSON.parse(JSON.stringify(f)) as FolderConfiguration
  if (!Array.isArray(c.devices)) {
    c.devices = []
  }
  if (c.minDiskFree != null && typeof c.minDiskFree !== 'string') {
    c.minDiskFree = String(c.minDiskFree)
  }
  if (c.versioning != null && typeof c.versioning === 'object') {
    const p = c.versioning.params
    if (p == null || typeof p !== 'object' || Array.isArray(p)) {
      c.versioning = { ...c.versioning, params: {} }
    }
  }
  return c
}
