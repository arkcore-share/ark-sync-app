/**
 * 与 resources/agent-artifact-scan-rules.json 结构一致（可手动编辑该 JSON）。
 */

export type DataRootCandidate =
  | { kind: 'home'; segments: string[] }
  | { kind: 'env'; envVar: 'LOCALAPPDATA' | 'APPDATA'; segments: string[] }

export type ArtifactPathRule = {
  base: 'home' | 'dataRoot'
  segments: string[]
  enumerate?: boolean
  maxEntries?: number
  enumerateLabelPrefix?: string
}

export type AgentArtifactScanRule = {
  id: string
  dataRootCandidates: DataRootCandidate[]
  dataPresentIfAny: DataRootCandidate[]
  skills: ArtifactPathRule[]
  memory: ArtifactPathRule[]
  files: ArtifactPathRule[]
  extraRootsForGenericClawMerge?: DataRootCandidate[]
  appendGenericUnderDataRoot?: boolean
  /**
   * `appendGenericUnderDataRoot` / `extraRootsForGenericClawMerge` 触发的 skills 收集：
   * 默认 `enumerate` 列出 `skills/` 下每一项；`folder` 只展示 `skills`（或 `skill`）目录本身一条。
   */
  genericSkillsCollect?: 'enumerate' | 'folder'
}
