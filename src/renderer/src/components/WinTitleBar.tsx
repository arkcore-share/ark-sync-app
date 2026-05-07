import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function WinTitleBar(): React.ReactElement {
  const { t } = useTranslation()
  const [maximized, setMaximized] = useState(false)

  const refreshMaximized = useCallback(async () => {
    const r = await window.syncWeb?.windowIsMaximized?.()
    if (typeof r === 'boolean') {
      setMaximized(r)
    }
  }, [])

  useEffect(() => {
    void refreshMaximized()
    const unsub = window.syncWeb?.onWindowMaximized?.((v) => setMaximized(v))
    return () => {
      unsub?.()
    }
  }, [refreshMaximized])

  const onMinimize = (): void => {
    void window.syncWeb?.windowMinimize?.()
  }

  const onMaxToggle = (): void => {
    void (async () => {
      const next = await window.syncWeb?.windowMaximizeToggle?.()
      if (typeof next === 'boolean') {
        setMaximized(next)
      }
    })()
  }

  const onClose = (): void => {
    void window.syncWeb?.windowClose?.()
  }

  return (
    <header className="win-titlebar">
      <span className="win-titlebar-title">{t('Ark.AppTitle')}</span>
      <div className="win-titlebar-controls">
        <button type="button" className="win-titlebar-btn" title="Minimize" onClick={onMinimize}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path fill="currentColor" d="M0 5h12v2H0z" />
          </svg>
        </button>
        <button type="button" className="win-titlebar-btn" title="Maximize" onClick={onMaxToggle}>
          {maximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                d="M3 5h6v6H3zM5 5V3h6v6H9"
              />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          )}
        </button>
        <button type="button" className="win-titlebar-btn close" title="Close" onClick={onClose}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              d="M2 2l8 8M10 2L2 10"
            />
          </svg>
        </button>
      </div>
    </header>
  )
}
