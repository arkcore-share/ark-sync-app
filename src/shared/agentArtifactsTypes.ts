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
