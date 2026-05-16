import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConnection } from '../context/ConnectionContext'
import { getSystemInfo, isElectronApp, openExternalUrl, SystemInfo } from '../electronBridge'

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

function prettyPlatform(p: string): string {
  if (p === 'win32') return 'Windows'
  if (p === 'darwin') return 'macOS'
  if (p === 'linux') return 'Linux'
  return p
}

function prettyArch(a: string): string {
  if (a === 'x64') return 'x64'
  if (a === 'arm64') return 'ARM64'
  if (a === 'ia32') return 'x86'
  return a
}

export default function AboutPage(): React.ReactElement {
  const { t } = useTranslation()
  const { connection } = useConnection()
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)

  useEffect(() => {
    if (isElectronApp()) {
      getSystemInfo().then(setSysInfo).catch(() => setSysInfo(null))
    }
  }, [])

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

          {sysInfo && isElectronApp() && (
            <div className="muted" style={{ margin: '0 0 1rem', fontSize: '0.85rem' }}>
              <div style={{ marginBottom: '0.25rem' }}>
                <span style={{ opacity: 0.7 }}>{t('Ark.AboutSystem')}:</span> {prettyPlatform(sysInfo.platform)} ({prettyArch(sysInfo.arch)})
              </div>
              <div style={{ marginBottom: '0.25rem' }}>
                <span style={{ opacity: 0.7 }}>{t('Ark.AboutElectron')}:</span> {sysInfo.electronVersion}
              </div>
              <div>
                <span style={{ opacity: 0.7 }}>{t('Ark.AboutNode')}:</span> {sysInfo.nodeVersion}
              </div>
            </div>
          )}

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
