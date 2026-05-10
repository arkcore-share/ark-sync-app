/** Skills 安全检测汇总（Cursor / Hermes 等 skills 目录下 SKILL.md；合并内置规则 + 本地 gitleaks.toml 正则） */
export type SkillsSecuritySeverity = 'high' | 'medium' | 'low' | 'ok'

/** 内置 / 规则库命中的问题类别（用于检测详情页与文案映射） */
export type SkillSecurityFindingKind =
  | 'builtin_secrets'
  | 'builtin_dangerous_exec'
  | 'builtin_network'
  | 'builtin_filesystem'
  | 'gitleaks'

export type SkillSecurityFinding = {
  kind: SkillSecurityFindingKind
  gitleaksRuleId?: string
  gitleaksDescription?: string
}

export type SkillSecurityDetail = {
  path: string
  severity: SkillsSecuritySeverity
  /** 仅高危/中危/低危时有意义；健康项可为空数组 */
  findings: SkillSecurityFinding[]
}

/** @deprecated 使用 SkillSecurityDetail；保留别名便于渐进迁移 */
export type SkillSecurityItem = SkillSecurityDetail

export type SkillsSecurityResult = {
  high: number
  medium: number
  low: number
  /** 未命中高危/中危/低危规则，视为健康 */
  ok: number
  /** 参与评级的 SKILL.md 数量 */
  skillFiles: number
  /** 每个 SKILL.md 的路径、等级与命中项 */
  skills: SkillSecurityDetail[]
  /**
   * 从本机 `gitleaks.toml` 载入并参与匹配的正则规则条数（含 `regex` 且编译成功）。
   * 为 0 时可能是文件不存在、解析失败，或规则在 SKILL.md 正文中未额外改变分级（仍可能已加载）。
   */
  gitleaksRegexRulesUsed: number
  scannedAt: number
  durationMs: number
}
