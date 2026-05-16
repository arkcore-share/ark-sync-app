import React from 'react'
import { useTranslation } from 'react-i18next'

const APP_LINE = 'Ark Sync v1.0.0'

export default function AboutPage(): React.ReactElement {
  const { t } = useTranslation()

  return (
    <div className="settings-page">
      <div className="settings-shell">
        <header className="settings-shell-header">
          <span className="settings-shell-title-glyph" aria-hidden>
            ℹ
          </span>
          <h1 className="settings-shell-title">{t('Ark.AboutTitle')}</h1>
        </header>

        <div className="settings-body">
          <p style={{ margin: '0 0 0.75rem', fontWeight: 600 }}>{APP_LINE}</p>
          <p className="muted" style={{ margin: '0 0 1rem', lineHeight: 1.6 }}>
            {t('Ark.AboutDescription')}
          </p>
          <p className="muted" style={{ margin: '0 0 1rem', lineHeight: 1.6 }}>
            {t('Ark.AboutFeatures')}
          </p>
        </div>
      </div>
    </div>
  )
}
