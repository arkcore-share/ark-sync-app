import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { initI18n } from '../i18n'

export default function I18nGate({ children }: { children: React.ReactNode }): React.ReactElement {
  const { t } = useTranslation()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void initI18n().then(() => setReady(true))
  }, [])

  if (!ready) {
    return (
      <div className="main" style={{ padding: '2rem' }}>
        <p className="muted">{t('Ark.Loading')}</p>
      </div>
    )
  }

  return <>{children}</>
}
