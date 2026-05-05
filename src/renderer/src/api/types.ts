/** Subset of Syncthing REST types used by Sync Web */

export type VersioningConfiguration = {
  type: string
  params?: Record<string, string>
  cleanupIntervalS?: number
  fsPath?: string
  fsType?: string
}

export type FolderConfiguration = {
  id: string
  label: string
  /** 可选分组，与官方「文件夹组」一致 */
  group?: string
  path: string
  type: 'sendreceive' | 'sendonly' | 'receiveonly' | 'receiveencrypted'
  devices: { deviceID: string; introducedBy?: string; encryptionPassword?: string }[]
  paused?: boolean
  rescanIntervalS?: number
  fsWatcherEnabled?: boolean
  fsWatcherDelayS?: number
  ignorePerms?: boolean
  autoNormalize?: boolean
  minDiskFree?: string
  versioning?: VersioningConfiguration
  copiers?: number
  pullerMaxPendingKiB?: number
  hashers?: number
  order?: string
  ignoreDelete?: boolean
  maxConflicts?: number
  markerName?: string
  blockIndexing?: boolean
  syncOwnership?: boolean
  sendOwnership?: boolean
  syncXattrs?: boolean
  sendXattrs?: boolean
}

/** GET /rest/db/status — matches lib/model FolderSummary */
export type FolderSummary = {
  globalFiles: number
  globalDirectories: number
  globalBytes: number
  localFiles: number
  localDirectories: number
  localBytes: number
  needFiles: number
  needDirectories?: number
  needBytes: number
  needTotalItems?: number
  globalTotalItems?: number
  localTotalItems?: number
  state: string
  stateChanged?: string
  error?: string
  invalid?: string
  folder?: string
}

export type FolderStatisticsEntry = {
  lastScan?: string
  lastFile?: {
    at?: string
    filename?: string
    deleted?: boolean
  }
}

export type DiscoveryStatusEntry = {
  error?: string | null
}

export type ListenerStatusEntry = {
  error?: string | null
  lanAddresses?: string[]
  wanAddresses?: string[]
}

export type LdapConfiguration = {
  address?: string
  bindDN?: string
  transport?: number
  insecureSkipVerify?: boolean
  searchBaseDN?: string
  searchFilter?: string
}

/** 配置中「忽略的文件夹」条目（与官方 remote/pending 观察结构一致） */
export type ObservedFolder = {
  time?: string
  id: string
  label?: string
}

/** 顶层 remoteIgnoredDevices 条目 */
export type ObservedRemoteDevice = {
  time?: string
  deviceID: string
  name?: string
  address?: string
}

/** GET /rest/cluster/pending/devices — 键为设备 ID */
export type PendingClusterDeviceEntry = {
  time?: string
  name?: string
  address?: string
}

/** GET /rest/cluster/pending/folders — offeredBy 的键为设备 ID */
export type PendingClusterFolderOffer = {
  time?: string
  label?: string
  receiveEncrypted?: boolean
}

export type PendingClusterFolderEntry = {
  offeredBy: Record<string, PendingClusterFolderOffer>
}

export type DeviceConfiguration = {
  deviceID: string
  name: string
  addresses?: string[]
  paused?: boolean
  compression?: string
  introducer?: boolean
  skipIntroductionRemovals?: boolean
  autoAcceptFolders?: boolean
  untrusted?: boolean
  /** REST 字段 numConnections，0 表示由 Syncthing 决定 */
  numConnections?: number
  maxSendKbps?: number
  maxRecvKbps?: number
  group?: string
  certName?: string
  ignoredFolders?: ObservedFolder[]
}

export type SystemStatus = {
  myID: string
  /** 主目录展开路径，用于路径说明（与官方 GUI 一致） */
  tilde?: string
  version?: string
  alloc?: number
  cpuPercent?: number
  discoveryEnabled?: boolean
  connectionServiceStatus?: Record<string, ListenerStatusEntry>
  discoveryStatus?: Record<string, DiscoveryStatusEntry>
  uptime?: number
  /** 官方设置页：用量报告版本上限、候选版标识、GUI 地址是否被环境变量覆盖 */
  urVersionMax?: number
  isCandidate?: boolean
  guiAddressOverridden?: boolean
  guiAddressUsed?: string
}

export type ConnectionEntry = {
  connected: boolean
  address?: string
  type?: string
  isLocal?: boolean
  crypto?: string
  clientVersion?: string
  inBytesTotal?: number
  outBytesTotal?: number
  paused?: boolean
  secondary?: unknown[]
}

export type DeviceStatisticsEntry = {
  lastSeen?: string
  lastConnectionDurationS?: number
}

export type ConnectionsResponse = {
  connections: Record<string, ConnectionEntry>
  total: { inBytesTotal: number; outBytesTotal: number }
}

export type GuiConfiguration = {
  enabled?: boolean
  address?: string
  user?: string
  password?: string
  useTLS?: boolean
  apiKey?: string
  theme?: string
  unixSocketPermissions?: string
  insecureSkipHostcheck?: boolean
  insecureAllowFrameLoading?: boolean
  authMode?: string
}

export type SystemConfig = {
  version: number
  folders: FolderConfiguration[]
  devices: DeviceConfiguration[]
  options: Record<string, unknown>
  gui: GuiConfiguration
  ldap?: LdapConfiguration
  remoteIgnoredDevices?: ObservedRemoteDevice[]
  defaults?: Record<string, unknown>
}

export type DbIgnoresResponse = {
  ignore: string[]
  expanded?: string[]
  error?: string
}

export type FileVersion = {
  versionTime: string
  modTime: string
  size: number
}

export type FolderVersionsMap = Record<string, FileVersion[]>

/** GET /rest/events/disk — LocalChangeDetected / RemoteChangeDetected 条目 */
export type SyncthingDiskEvent = {
  id: number
  globalID: number
  time: string
  type: string
  data: Record<string, string>
}
