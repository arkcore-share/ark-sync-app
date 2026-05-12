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

export type AgentArtifactCategory = 'skills' | 'memory' | 'files'

export type AgentArtifactsExportOptions = {
  sourceDeviceId?: string
  sourceDeviceName?: string
}

export type AgentArtifactsExportManifestEntry = {
  id: string
  agentId: string
  agentName: string
  category: AgentArtifactCategory
  categoryLabel: string
  kind: AgentArtifactEntry['kind']
  label: string
  sourcePath: string
  sourceDataRoot: string | null
  relativeToDataRoot: string | null
  exportedRelativePath: string
}

export type AgentArtifactsExportManifest = {
  schemaVersion: 1
  createdAt: string
  sourceDevice: {
    arkSyncDeviceId: string | null
    name: string | null
    hostname: string
    platform: string
    osRelease: string
    homeDir: string
  }
  syncTmpRoot: string
  payloadRootRelative: string
  entries: AgentArtifactsExportManifestEntry[]
}

export type AgentArtifactsExportResult = {
  ok: boolean
  targetRoot: string
  exportRoot: string
  manifestPath: string
  agents: number
  entries: number
  copiedFiles: number
  copiedDirs: number
  skipped: number
  errors: string[]
}
