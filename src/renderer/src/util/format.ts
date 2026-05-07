import type { ConnectionEntry, DeviceConfiguration } from '../api/types'

export function formatBytes(n: number): string {
  if (n < 1024) {
    return `${n} B`
  }
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

export function shortDeviceId(id: string): string {
  const parts = id.split('-')
  return parts.length ? parts[0] : id
}

/** 与 REST 返回的 deviceID、system/status 的 myID 比较（忽略大小写、连字符与首尾空白） */
export function sameDeviceId(a: string, b: string): boolean {
  const na = a.trim().replace(/-/g, '').toLowerCase()
  const nb = b.trim().replace(/-/g, '').toLowerCase()
  return na.length > 0 && na === nb
}

/** connections 的 key 可能与 config 中 deviceID 大小写不一致时查找条目 */
export function getConnectionEntryForDevice(
  connections: Record<string, ConnectionEntry> | null | undefined,
  deviceId: string
): ConnectionEntry | undefined {
  if (!connections || !deviceId.trim()) {
    return undefined
  }
  const id = deviceId.trim()
  if (connections[id]) {
    return connections[id]
  }
  for (const [k, v] of Object.entries(connections)) {
    if (sameDeviceId(k, id)) {
      return v
    }
  }
  return undefined
}

/** stats / bps 等以 deviceID 为 key 的 map，在 key 与 config 大小写不一致时取值 */
export function getValueByDeviceId<T>(
  map: Record<string, T> | null | undefined,
  deviceId: string
): T | undefined {
  if (!map || !deviceId.trim()) {
    return undefined
  }
  const id = deviceId.trim()
  if (map[id] !== undefined) {
    return map[id]
  }
  for (const [k, v] of Object.entries(map)) {
    if (sameDeviceId(k, id)) {
      return v
    }
  }
  return undefined
}

/** 用配置解析设备显示名（deviceID 与 config 中大小写/格式不一致时仍可命中） */
export function resolveDeviceNameFromConfig(
  devices: DeviceConfiguration[] | undefined,
  deviceId: string
): string {
  const id = deviceId.trim()
  if (!id) {
    return '—'
  }
  const d = devices?.find((x) => sameDeviceId(x.deviceID, id))
  const n = d?.name?.trim()
  if (n) {
    return n
  }
  return id.split('-')[0] || id.slice(0, 7)
}

/** 容错解析 `/rest/config` 的 devices 数组（兼容异常键名） */
export function coerceConfigDevicesFromResponse(devices: unknown): DeviceConfiguration[] {
  if (!Array.isArray(devices)) {
    return []
  }
  return devices.map((raw) => {
    const r = raw as Record<string, unknown>
    const deviceID = String(r.deviceID ?? r.deviceId ?? '')
    const base = raw as DeviceConfiguration
    return {
      ...base,
      deviceID,
      name: typeof r.name === 'string' ? r.name : String(r.name ?? '')
    }
  })
}

const PLATFORM_PRETTY: Record<string, string> = {
  'linux-amd64': 'Linux (64-bit Intel/AMD)',
  'linux-386': 'Linux (32-bit Intel)',
  'linux-arm64': 'Linux (64-bit ARM)',
  'linux-armv7': 'Linux (ARMv7)',
  'linux-armv6': 'Linux (ARMv6)',
  'darwin-amd64': 'macOS (64-bit Intel)',
  'darwin-arm64': 'macOS (Apple Silicon)',
  'windows-amd64': 'Windows (64-bit)',
  'windows-386': 'Windows (32-bit)',
  'freebsd-amd64': 'FreeBSD (64-bit)',
  'freebsd-386': 'FreeBSD (32-bit)',
  'openbsd-amd64': 'OpenBSD (64-bit)',
  'openbsd-386': 'OpenBSD (32-bit)',
  'netbsd-amd64': 'NetBSD (64-bit)',
  'solaris-amd64': 'Solaris (64-bit)',
  'illumos-amd64': 'Illumos (64-bit)'
}

function prettyPlatformToken(token: string): string {
  const t = token.trim().toLowerCase().replace(/\s+/g, '-')
  return PLATFORM_PRETTY[t] || token.trim()
}

/**
 * 展示用版本行：去掉构建用户/时间、(go x.y …)、驱动标签与 Windows 构建机等，只保留版本名与可读平台。
 */
export function formatDisplaySyncthingVersion(raw: string): string {
  let s = raw.replace(/^syncthing\s+/i, '').trim()
  if (!s) {
    return ''
  }

  /* 可选标签，如 [modernc-sqlite] */
  s = s.replace(/\s*\[[^\]]+\]/g, '')
  /* Windows 构建机串：COMPUTER\user@host */
  s = s.replace(/\s+[A-Za-z0-9_.-]+\\[A-Za-z0-9_.-]+@[A-Za-z0-9_.:-]+/g, '')

  let platformFromGo = ''
  const goParen = s.match(/\(\s*go[\d.]+\s+([^)]+)\s*\)/i)
  if (goParen?.[1]) {
    platformFromGo = goParen[1].trim()
  }

  s = s.replace(/\([^)]*@[^)]*\bUTC\b[^)]*\)/gi, '')
  /* 括号内 user@host + 日期 */
  s = s.replace(/\([^)]*@[^)]*\d{4}-\d{2}-\d{2}[^)]*\)/gi, '')
  s = s.replace(/\(\s*go[\d.]+\s+[^)]+\)/gi, '')
  /* 裸构建串：root@host 2026-05-01 … UTC（无括号时） */
  s = s.replace(/\s+[\w.-]+@[\w.-]+\s+\d{4}-\d{2}-\d{2}[^\s,)]*(\s+[Uu][Tt][Cc])?/gi, '')
  /* 日期后时间 + UTC，如 2026-05-01 05:09:14 UTC */
  s = s.replace(/\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}:\d{2}(\s*[Uu][Tt][Cc])?/g, '')
  /* 单独残留的时间 + UTC */
  s = s.replace(/\b\d{1,2}:\d{2}:\d{2}(\s+[Uu][Tt][Cc])?\b/g, '')
  /* 发行代号，如 v2.0.16 "Hafnium Hornet" */
  s = s.replace(/\s+"[^"]*"/g, '')
  s = s.replace(/\s+/g, ' ').trim()

  const beforeParen = s.split('(')[0].trim().replace(/,\s*$/, '')

  if (platformFromGo) {
    const plat = prettyPlatformToken(platformFromGo)
    if (beforeParen) {
      return `${beforeParen}, ${plat}`
    }
    return plat
  }

  const parts = s.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) {
    const plat = prettyPlatformToken(parts[parts.length - 1])
    const ver = parts.slice(0, -1).join(', ')
    return `${ver}, ${plat}`
  }

  return beforeParen || s
}
