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
            Ark Sync 是用于连接与管理文件同步实例的桌面与 Web 客户端。底层同步能力由兼容引擎提供；本应用为独立发布的客户端界面。
          </p>
          <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
            <button type="button" style={extLinkStyle} onClick={() => void openExternalUrl('https://syncthing.net/')}>
              同步引擎开源项目
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
