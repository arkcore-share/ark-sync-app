import React from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const { connection } = useConnection()

  return (
    <div className="settings-page">
      <div className="settings-shell">
        <header className="settings-shell-header">
          <span className="settings-shell-title-glyph" aria-hidden>
            ℹ
          </span>
          <h1 className="settings-shell-title">{t('Ark.AboutTitle')}</h1>
        </header>

        {connection?.baseUrl ? (
          <p className="settings-shell-sub muted">
            {t('Ark.AboutCurrentInstance')} <code>{connection.baseUrl}</code>
          </p>
        ) : null}

        <div className="settings-body">
          <p style={{ margin: '0 0 0.75rem', fontWeight: 600 }}>{APP_LINE}</p>
          <p className="muted" style={{ margin: '0 0 1rem', lineHeight: 1.5 }}>
            {t('Ark.AboutDescription')}
          </p>
          <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
            <button type="button" style={extLinkStyle} onClick={() => void openExternalUrl('https://syncthing.net/')}>
              {t('Ark.AboutSyncEngine')}
            </button>
            {' · '}
            <button type="button" style={extLinkStyle} onClick={() => void openExternalUrl('https://docs.syncthing.net/')}>
              {t('Ark.Docs')}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
