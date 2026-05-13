/** 智能体数据目录下单个条目（技能包、记忆文件、配置等） */
export type AgentArtifactEntry = {
  /** 绝对路径 */
  path: string
  kind: 'file' | 'dir'
  /** 展示用短名（可选） */
  label?: string
}

/** 与总览目录一致：每个产品的 Skill / Memory / Files 探测结果 */
export type AgentArtifactsDetail = {
  id: string
  name: string
  installed: boolean
  via?: string
  /** 主进程推断的数据根目录（如 ~/.hermes、%LOCALAPPDATA%\\hermes） */
  dataRoot: string | null
  dataRootPresent: boolean
  skills: AgentArtifactEntry[]
  memory: AgentArtifactEntry[]
  files: AgentArtifactEntry[]
}

/** 将智能体条目导出到 ~/.sync_tmp 后的结果摘要 */
export type AgentArtifactsSyncTmpExportResult = {
  ok: boolean
  targetRoot: string
  copiedItems: number
  copiedFiles: number
  copiedDirs: number
  skipped: number
  errors: string[]
}

/** 从 ~/.sync_tmp 中转目录与本地智能体目录做双向同步后的结果 */
export type AgentConfigSyncResult = {
  ok: boolean
  mode: 'synced' | 'local_scan_only'
  message: string
  relayRoot: string | null
  runId: string | null
  reportDir: string | null
  dryRun: boolean
  copiedToLocal: number
  copiedToRelay: number
  conflicts: number
  skipped: number
  errors: string[]
}

export type AgentConfigSyncScanResult = {
  hasRelayContent: boolean
  relayRoot: string | null
  syncTmpRoot: string
}

export type AgentConfigSyncRollbackResult = {
  ok: boolean
  runId: string
  restoredLocal: number
  restoredRelay: number
  errors: string[]
}
