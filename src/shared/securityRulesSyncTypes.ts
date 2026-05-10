/** 本机规则库路径（由主进程 `app.getPath('userData')/security-rules` 解析） */
export type SecurityRulesPaths = {
  /** `security-rules` 目录绝对路径（首次同步前可能尚未在磁盘创建） */
  dir: string
  /** `gitleaks.toml` 绝对路径 */
  gitleaks: string
}

/** gitleaks 规则库后台同步状态（主进程 → 渲染进程） */
export type SecurityRulesSyncStatus = {
  /** 本自然日已成功拉取 gitleaks.toml */
  isFreshToday: boolean
  /** 正在请求并写入规则文件 */
  isDownloading: boolean
}
