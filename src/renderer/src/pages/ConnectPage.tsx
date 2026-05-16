import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { isElectronApp } from '../electronBridge'
import { useConnection } from '../context/ConnectionContext'

const DEFAULT_BASE = 'http://127.0.0.1:8384'

export default function ConnectPage(): React.ReactElement {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setConnection, error: bootError } = useConnection()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enterSystem = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      if (!isElectronApp()) {
        throw new Error(t('Ark.ConnectErrorBrowserOnly'))
      }
      await setConnection({
        baseUrl: DEFAULT_BASE,
        apiKey: '',
        rejectUnauthorized: true,
        localSession: true
      })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [navigate, setConnection])

  return (
    <div className="connect-welcome-root">
      <div className="connect-welcome">
        <div className="connect-welcome-inner card">
          <div className="connect-welcome-grid">
            <div className="connect-welcome-visual">
              <div className="connect-welcome-art">
                <img src="/connect-welcome.png" alt="" width={400} height={400} decoding="async" />
              </div>
            </div>
            <div className="connect-welcome-copy">
              <h1 className="connect-welcome-title">{t('Ark.ConnectTitle')}</h1>
              <p className="connect-welcome-tagline">{t('Ark.ConnectTagline')}</p>
              <ul className="connect-welcome-features">
                <li>
                  <div className="connect-welcome-feature-body">
                    <span className="connect-welcome-feature-name">{t('Ark.ConnectFeatureSkillSecurity')}</span>
                    <span className="connect-welcome-feature-desc">
                      {t('Ark.ConnectFeatureSkillSecurityDesc')}
                    </span>
                  </div>
                </li>
                <li>
                  <div className="connect-welcome-feature-body">
                    <span className="connect-welcome-feature-name">{t('Ark.ConnectFeatureMigration')}</span>
                    <span className="connect-welcome-feature-desc">
                      {t('Ark.ConnectFeatureMigrationDesc')}
                    </span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
          <div className="connect-welcome-actions">
            {(bootError || error) && <div className="error-banner">{bootError || error}</div>}
            <button
              type="button"
              className="primary connect-welcome-btn"
              disabled={busy}
              onClick={() => void enterSystem()}
            >
              {busy ? t('Ark.ConnectEntering') : t('Ark.ConnectEnterSystem')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
