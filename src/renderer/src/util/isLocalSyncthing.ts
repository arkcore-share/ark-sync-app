/** 本机 Ark Sync 引擎地址（免 API 密钥 + CSRF 会话仅允许这些主机） */
export function isLocalSyncthingBase(url: string): boolean {
  try {
    const u = new URL(url.trim())
    const h = u.hostname.toLowerCase()
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]'
  } catch {
    return false
  }
}
