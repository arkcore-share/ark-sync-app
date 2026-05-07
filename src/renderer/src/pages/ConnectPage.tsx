import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isElectronApp } from '../electronBridge'
import { useConnection } from '../context/ConnectionContext'
import { isLocalSyncthingBase } from '../util/isLocalSyncthing'

export default function ConnectPage(): React.ReactElement {
  const navigate = useNavigate()
  const { setConnection, error: bootError } = useConnection()
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:8384')
  const [apiKey, setApiKey] = useState('')
  const [rejectUnauthorized, setRejectUnauthorized] = useState(true)
  const [localSession, setLocalSession] = useState(false)
  const [guiAuth, setGuiAuth] = useState(false)
  const [guiUser, setGuiUser] = useState('')
  const [guiPassword, setGuiPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const usingApiKey = apiKey.trim().length > 0

  const canSubmit =
    usingApiKey ||
    (isElectronApp() &&
      isLocalSyncthingBase(baseUrl) &&
      localSession &&
      !guiAuth) ||
    (isElectronApp() && guiAuth && guiUser.trim().length > 0)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (usingApiKey) {
        await setConnection({
          baseUrl,
          apiKey,
          rejectUnauthorized,
          localSession: false
        })
      } else if (guiAuth && isElectronApp()) {
        await setConnection({
          baseUrl,
          apiKey: '',
          rejectUnauthorized,
          localSession: false,
          guiUser: guiUser.trim(),
          guiPassword
        })
      } else {
        await setConnection({
          baseUrl,
          apiKey: '',
          rejectUnauthorized,
          localSession: localSession && isElectronApp() && isLocalSyncthingBase(baseUrl)
        })
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="connect-page card">
      <h1>Syncthing Sync Web</h1>
      <p className="muted">
        连接到 Syncthing 实例。若已设置 GUI 密码或启用 LDAP，可使用 API 密钥，或在 Electron 中使用「GUI
        账户」由主进程完成 Basic 认证与 CSRF。
      </p>
      {!isElectronApp() && (
        <p className="muted">
          当前为<strong>纯浏览器</strong>模式：须填写 API 密钥；连接信息保存在 <code>localStorage</code>。
          本机免密钥与 GUI 账户登录仅支持 <code>npm run dev</code> 打开的 Electron 窗口。
        </p>
      )}
      {(bootError || error) && <div className="error-banner">{bootError || error}</div>}
      <form onSubmit={submit} className="stack">
        <div className="field">
          <label htmlFor="baseUrl">实例地址</label>
          <input
            id="baseUrl"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://127.0.0.1:8384"
            autoComplete="url"
          />
        </div>

        {isElectronApp() && (
          <div className="field checkbox">
            <label>
              <input
                type="checkbox"
                checked={localSession}
                disabled={guiAuth || usingApiKey}
                onChange={(e) => {
                  setLocalSession(e.target.checked)
                  if (e.target.checked) {
                    setGuiAuth(false)
                    setApiKey('')
                  }
                }}
              />
              本机、未设置 GUI 密码 — 免填 API 密钥（主进程 CSRF，仅 127.0.0.1 / localhost / ::1）
            </label>
          </div>
        )}

        {isElectronApp() && (
          <div className="field checkbox">
            <label>
              <input
                type="checkbox"
                checked={guiAuth}
                disabled={localSession || usingApiKey}
                onChange={(e) => {
                  setGuiAuth(e.target.checked)
                  if (e.target.checked) {
                    setLocalSession(false)
                    setApiKey('')
                  }
                }}
              />
              使用 GUI 用户名/密码（静态密码或 LDAP，由主进程代理认证）
            </label>
          </div>
        )}

        {isElectronApp() && guiAuth && (
          <>
            <div className="field">
              <label htmlFor="guiUser">GUI 用户名</label>
              <input
                id="guiUser"
                value={guiUser}
                onChange={(e) => setGuiUser(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="field">
              <label htmlFor="guiPassword">GUI 密码</label>
              <input
                id="guiPassword"
                type="password"
                value={guiPassword}
                onChange={(e) => setGuiPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="apiKey">
            API 密钥
            {(localSession || guiAuth) && isElectronApp() ? '（当前方式已跳过）' : ''}
          </label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value)
              if (e.target.value.trim()) {
                setLocalSession(false)
                setGuiAuth(false)
              }
            }}
            placeholder="从 Syncthing Web GUI 复制"
            autoComplete="off"
            disabled={Boolean((localSession || guiAuth) && isElectronApp())}
          />
        </div>
        <div className="field checkbox">
          <label>
            <input
              type="checkbox"
              checked={rejectUnauthorized}
              onChange={(e) => setRejectUnauthorized(e.target.checked)}
            />
            校验 TLS 证书（关闭仅建议在可信内网自签名场景）
          </label>
        </div>
        <div className="row" style={{ marginTop: '0.5rem' }}>
          <button type="submit" className="primary" disabled={busy || !canSubmit}>
            <span className="btn-glyph" aria-hidden>
              {busy ? '…' : '⎘'}
            </span>
            {busy ? '连接中…' : '连接'}
          </button>
        </div>
      </form>
    </div>
  )
}
