/** 主进程执行 `scripts/third-party/<id>.ps1|.sh` 后的结果 */
export type ThirdPartyInstallResult = {
  ok: boolean
  error?: string
  log: string
  exitCode: number | null
}
