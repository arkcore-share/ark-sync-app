/** 总览「环境扫描」单行结果（主进程生成，经 IPC 传给渲染进程） */
export type ThirdPartyScanRow = {
  id: string
  /** 界面展示名 */
  name: string
  installed: boolean
  /** 判定依据（可选，便于排障） */
  via?: string
}

export type ThirdPartyScanResult = {
  items: ThirdPartyScanRow[]
  scannedAt: number
  durationMs: number
}
