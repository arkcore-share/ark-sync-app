import React from 'react'
import { useConnection } from '../context/ConnectionContext'
import { openExternalUrl } from '../electronBridge'

const APP_LINE = 'Ark Sync v1.0.0'

const extLinkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'var(--accent, #6cb3ff)',
  cursor: 'pointer',
  font: 'inherit',
  textDecoration: 'underline'
}

export default function AboutPage(): React.ReactElement {
  const { connection } = useConnection()

  return (
    <div className="settings-page">
      <div className="settings-shell">
        <header className="settings-shell-header">
          <span className="settings-shell-title-glyph" aria-hidden>
            ℹ
          </span>
          <h1 className="settings-shell-title">关于</h1>
        </header>

        {connection?.baseUrl ? (
          <p className="settings-shell-sub muted">
            当前实例 <code>{connection.baseUrl}</code>
          </p>
        ) : null}

        <div className="settings-body">
          <p style={{ margin: '0 0 0.75rem', fontWeight: 600 }}>{APP_LINE}</p>
          <p className="muted" style={{ margin: '0 0 1rem', lineHeight: 1.5 }}>
            用于连接与管理 Syncthing 的桌面与 Web 客户端界面。同步引擎由 Syncthing 提供；本应用为独立界面，不隶属于
            Syncthing 官方项目。
          </p>
          <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
            <button type="button" style={extLinkStyle} onClick={() => void openExternalUrl('https://syncthing.net/')}>
              Syncthing 官网
            </button>
            {' · '}
            <button type="button" style={extLinkStyle} onClick={() => void openExternalUrl('https://docs.syncthing.net/')}>
              文档
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
