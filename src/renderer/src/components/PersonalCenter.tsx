import React, { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import QrModal from './QrModal'
import { useConnection } from '../context/ConnectionContext'
import { openExternalUrl, quitElectronApp, restartElectronApp } from '../electronBridge'
import { applySyncthingLocale, LOCALE_PICKER_OPTIONS } from '../i18n'

/** 与 Ark Sync Web GUI「帮助」菜单一致：分组、顺序、图标风格 */
type HelpMenuExternal = { kind: 'external'; tkey: string; url: string; glyph: string }
type HelpMenuAbout = { kind: 'about'; tkey: string; glyph: string }
type HelpMenuItem = HelpMenuExternal | HelpMenuAbout

/** Portal 必须挂在 React 根容器内，否则 React 委托在 #root 上，body 下的节点点击不会触发 onClick */
function getPortalContainer(): HTMLElement {
  return document.getElementById('root') ?? document.body
}

const HELP_MENU_GROUPS: HelpMenuItem[][] = [
  [{ kind: 'external', tkey: 'Introduction', glyph: 'ⓘ', url: 'https://docs.syncthing.net/intro/getting-started.html' }],
  [
    { kind: 'external', tkey: 'Home page', glyph: '⌂', url: 'https://syncthing.net/' },
    { kind: 'external', tkey: 'Documentation', glyph: '📖', url: 'https://docs.syncthing.net/' },
    { kind: 'external', tkey: 'Support', glyph: '👥', url: 'https://forum.syncthing.net/' }
  ],
  [
    { kind: 'external', tkey: 'Changelog', glyph: '📄', url: 'https://github.com/syncthing/syncthing/releases' },
    { kind: 'external', tkey: 'Statistics', glyph: '📊', url: 'https://data.syncthing.net/' }
  ],
  [
    { kind: 'external', tkey: 'Bugs', glyph: '🐛', url: 'https://github.com/syncthing/syncthing/issues' },
    { kind: 'external', tkey: 'Source Code', glyph: '</>', url: 'https://github.com/syncthing/syncthing' }
  ],
  [{ kind: 'about', tkey: 'About', glyph: '♥' }]
]

const ARK_I18N_READY_LANGS = new Set(['zh-CN', 'zh-TW', 'zh-HK', 'en', 'es', 'fr', 'ja'])

function normalizeLangCode(code: string): string {
  return code.toLowerCase().replace(/_/g, '-')
}

export default function PersonalCenter(): React.ReactElement {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { client, disconnect } = useConnection()
  const [open, setOpen] = useState(false)
  const [helpMenuOpen, setHelpMenuOpen] = useState(false)
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const [serviceOpen, setServiceOpen] = useState(false)
  const [qrFor, setQrFor] = useState<string | null>(null)
  const [footerQr, setFooterQr] = useState<{ deviceId: string; dataUrl: string } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const helpTriggerRef = useRef<HTMLButtonElement>(null)
  const helpFlyoutRef = useRef<HTMLDivElement>(null)
  const langTriggerRef = useRef<HTMLButtonElement>(null)
  const langFlyoutRef = useRef<HTMLDivElement>(null)
  const serviceTriggerRef = useRef<HTMLButtonElement>(null)
  const serviceFlyoutRef = useRef<HTMLDivElement>(null)
  const [helpFlyoutPos, setHelpFlyoutPos] = useState<{ top: number; left: number } | null>(null)
  const [langFlyoutPos, setLangFlyoutPos] = useState<{ top: number; left: number } | null>(null)
  const [serviceFlyoutPos, setServiceFlyoutPos] = useState<{ top: number; left: number } | null>(null)
  const [langMoreOpen, setLangMoreOpen] = useState(false)

  const languageOptions = LOCALE_PICKER_OPTIONS.map((option) => ({
    ...option,
    ready: ARK_I18N_READY_LANGS.has(option.code)
  }))
  const readyLanguageOptions = languageOptions.filter((item) => item.ready)
  const pendingLanguageOptions = languageOptions.filter((item) => !item.ready)

  const close = useCallback(() => {
    setOpen(false)
    setHelpMenuOpen(false)
    setLangMenuOpen(false)
    setLangMoreOpen(false)
    setServiceOpen(false)
  }, [])

  const closeServiceOnly = useCallback(() => setServiceOpen(false), [])

  useEffect(() => {
    if (!open) {
      return
    }
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (
        helpFlyoutRef.current?.contains(t) ||
        langFlyoutRef.current?.contains(t) ||
        serviceFlyoutRef.current?.contains(t)
      ) {
        return
      }
      if (wrapRef.current && !wrapRef.current.contains(t)) {
        close()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (serviceOpen) {
          setServiceOpen(false)
        } else if (langMenuOpen) {
          setLangMenuOpen(false)
        } else if (helpMenuOpen) {
          setHelpMenuOpen(false)
        } else {
          close()
        }
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, helpMenuOpen, langMenuOpen, serviceOpen, close])

  const updateHelpFlyoutPosition = useCallback(() => {
    const trigger = helpTriggerRef.current
    if (!trigger || !helpMenuOpen) {
      return
    }
    const rect = trigger.getBoundingClientRect()
    const gap = 8
    const pad = 8
    const vw = window.innerWidth
    const vh = window.innerHeight

    const flyEl = helpFlyoutRef.current
    const flyH = flyEl?.offsetHeight ?? 360
    const flyW = flyEl?.offsetWidth ?? 308

    let left = rect.right + gap
    if (left + flyW > vw - pad) {
      left = Math.max(pad, rect.left - flyW - gap)
    }

    /* 二级菜单底部与「帮助」行底部对齐，再钳制到视口内 */
    let top = rect.bottom - flyH
    if (top < pad) {
      top = pad
    }
    if (top + flyH > vh - pad) {
      top = vh - pad - flyH
    }
    if (top < pad) {
      top = pad
    }

    setHelpFlyoutPos((prev) => {
      if (prev && Math.abs(prev.top - top) < 0.5 && Math.abs(prev.left - left) < 0.5) {
        return prev
      }
      return { top, left }
    })
  }, [helpMenuOpen])

  useLayoutEffect(() => {
    if (!helpMenuOpen) {
      setHelpFlyoutPos(null)
      return
    }
    updateHelpFlyoutPosition()
    const raf = window.requestAnimationFrame(() => updateHelpFlyoutPosition())
    return () => window.cancelAnimationFrame(raf)
  }, [helpMenuOpen, open, updateHelpFlyoutPosition])

  useEffect(() => {
    if (!helpMenuOpen || !open) {
      return
    }
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (helpTriggerRef.current?.contains(t) || helpFlyoutRef.current?.contains(t)) {
        return
      }
      setHelpMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [helpMenuOpen, open])

  useEffect(() => {
    if (!helpMenuOpen) {
      return
    }
    const onScrollResize = () => updateHelpFlyoutPosition()
    window.addEventListener('resize', onScrollResize)
    window.addEventListener('scroll', onScrollResize, true)
    return () => {
      window.removeEventListener('resize', onScrollResize)
      window.removeEventListener('scroll', onScrollResize, true)
    }
  }, [helpMenuOpen, updateHelpFlyoutPosition])

  const updateLangFlyoutPosition = useCallback(() => {
    const trigger = langTriggerRef.current
    if (!trigger || !langMenuOpen) {
      return
    }
    const rect = trigger.getBoundingClientRect()
    const gap = 8
    const pad = 8
    const vw = window.innerWidth
    const vh = window.innerHeight

    const flyEl = langFlyoutRef.current
    const flyH = flyEl?.offsetHeight ?? 420
    const flyW = flyEl?.offsetWidth ?? 520

    let left = rect.right + gap
    if (left + flyW > vw - pad) {
      left = Math.max(pad, rect.left - flyW - gap)
    }

    let top = rect.bottom - flyH
    if (top < pad) {
      top = pad
    }
    if (top + flyH > vh - pad) {
      top = vh - pad - flyH
    }
    if (top < pad) {
      top = pad
    }

    setLangFlyoutPos((prev) => {
      if (prev && Math.abs(prev.top - top) < 0.5 && Math.abs(prev.left - left) < 0.5) {
        return prev
      }
      return { top, left }
    })
  }, [langMenuOpen])

  useLayoutEffect(() => {
    if (!langMenuOpen) {
      setLangFlyoutPos(null)
      setLangMoreOpen(false)
      return
    }
    updateLangFlyoutPosition()
    const raf = window.requestAnimationFrame(() => updateLangFlyoutPosition())
    return () => window.cancelAnimationFrame(raf)
  }, [langMenuOpen, open, updateLangFlyoutPosition])

  useEffect(() => {
    if (!langMenuOpen) {
      return
    }
    const onScrollResize = () => updateLangFlyoutPosition()
    window.addEventListener('resize', onScrollResize)
    window.addEventListener('scroll', onScrollResize, true)
    return () => {
      window.removeEventListener('resize', onScrollResize)
      window.removeEventListener('scroll', onScrollResize, true)
    }
  }, [langMenuOpen, updateLangFlyoutPosition])

  const updateServiceFlyoutPosition = useCallback(() => {
    const el = serviceTriggerRef.current
    if (!el || !serviceOpen) {
      return
    }
    const rect = el.getBoundingClientRect()
    const gap = 8
    const estWidth = 240
    let left = rect.right + gap
    const maxFlyoutH = Math.min(280, window.innerHeight - 16)
    let top = rect.top
    if (top + maxFlyoutH > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - 8 - maxFlyoutH)
    }
    if (left + estWidth > window.innerWidth - 12) {
      left = Math.max(12, rect.left - estWidth - gap)
    }
    setServiceFlyoutPos({ top, left })
  }, [serviceOpen])

  useLayoutEffect(() => {
    if (!serviceOpen) {
      setServiceFlyoutPos(null)
      return
    }
    updateServiceFlyoutPosition()
  }, [serviceOpen, open, updateServiceFlyoutPosition])

  useEffect(() => {
    if (!serviceOpen || !open) {
      return
    }
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (serviceTriggerRef.current?.contains(t) || serviceFlyoutRef.current?.contains(t)) {
        return
      }
      setServiceOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [serviceOpen, open])

  useEffect(() => {
    if (!serviceOpen) {
      return
    }
    const onScrollResize = () => updateServiceFlyoutPosition()
    window.addEventListener('resize', onScrollResize)
    window.addEventListener('scroll', onScrollResize, true)
    return () => {
      window.removeEventListener('resize', onScrollResize)
      window.removeEventListener('scroll', onScrollResize, true)
    }
  }, [serviceOpen, updateServiceFlyoutPosition])

  useEffect(() => {
    if (!open || !client) {
      if (!open) {
        setFooterQr(null)
      }
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const st = await client.systemStatus()
        const id = st.myID?.trim()
        if (!id || cancelled) {
          return
        }
        const dataUrl = await client.getQrDataUrl(id)
        if (!cancelled) {
          setFooterQr({ deviceId: id, dataUrl })
        }
      } catch {
        if (!cancelled) {
          setFooterQr(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, client])

  const openLink = useCallback((url: string) => {
    void openExternalUrl(url).finally(() => {
      setHelpMenuOpen(false)
      setLangMenuOpen(false)
    })
  }, [])

  const showMyDeviceQr = async () => {
    if (!client) {
      return
    }
    try {
      const st = await client.systemStatus()
      const id = st.myID?.trim()
      if (!id) {
        throw new Error(t('Ark.DeviceIdError'))
      }
      setQrFor(id)
      close()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    }
  }

  const onRestart = () => {
    if (!window.confirm(t('Ark.ConfirmRestart'))) {
      return
    }
    closeServiceOnly()
    close()
    void restartElectronApp()
  }

  const onShutdown = () => {
    if (!window.confirm(t('Ark.ConfirmShutdown'))) {
      return
    }
    closeServiceOnly()
    close()
    void quitElectronApp()
  }

  const onDisconnect = () => {
    closeServiceOnly()
    close()
    void disconnect()
  }

  const openDeviceQrFromFooter = () => {
    if (footerQr?.deviceId) {
      setQrFor(footerQr.deviceId)
      close()
      return
    }
    void showMyDeviceQr()
  }

  const OpSep = (): React.ReactElement => (
    <div className="popover-divider" style={{ margin: '0.4rem 0' }} />
  )

  return (
    <div className="sidebar-personal" ref={wrapRef}>
      <button
        type="button"
        className="personal-center-trigger"
        onClick={() =>
          setOpen((v) => {
            const next = !v
            if (!next) {
              setHelpMenuOpen(false)
              setLangMenuOpen(false)
              setServiceOpen(false)
            }
            return next
          })
        }
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="personal-avatar" aria-hidden>
          ◎
        </span>
        <span className="personal-label">{t('Ark.PersonalCenter')}</span>
        <span className="personal-chevron" aria-hidden>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="personal-center-popover" role="menu">
          <div className="popover-section">
            <div className="popover-section-title">{t('Actions')}</div>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `popover-item popover-nav-link${isActive ? ' active' : ''}`
              }
              onClick={close}
            >
              <span className="popover-item-glyph" aria-hidden>
                ⚙
              </span>
              {t('Settings')}
            </NavLink>
            <NavLink
              to="/advanced"
              className={({ isActive }) =>
                `popover-item popover-nav-link${isActive ? ' active' : ''}`
              }
              onClick={close}
            >
              <span className="popover-item-glyph popover-item-glyph--advanced" aria-hidden>
                ◆
              </span>
              {t('Advanced')}
            </NavLink>

            <OpSep />

            <NavLink
              to="/logs"
              className={({ isActive }) =>
                `popover-item popover-nav-link${isActive ? ' active' : ''}`
              }
              onClick={close}
            >
              <span className="popover-item-glyph" aria-hidden>
                🔧
              </span>
              {t('Logs')}
            </NavLink>

            <div className="popover-lang-anchor">
              <button
                ref={langTriggerRef}
                type="button"
                className="popover-lang-trigger"
                aria-expanded={langMenuOpen}
                aria-haspopup="listbox"
                onClick={(e) => {
                  e.stopPropagation()
                  setHelpMenuOpen(false)
                  setServiceOpen(false)
                  setLangMenuOpen((v) => !v)
                }}
              >
                <span className="popover-lang-trigger-icon" aria-hidden>
                  🌐
                </span>
                <span className="popover-lang-trigger-label">{t('Ark.Language')}</span>
                <span className="popover-lang-trigger-chevron" aria-hidden>
                  {langMenuOpen ? '◀' : '▶'}
                </span>
              </button>
            </div>

            <OpSep />

            <div className="popover-service-anchor">
              <button
                ref={serviceTriggerRef}
                type="button"
                className="popover-service-trigger"
                aria-expanded={serviceOpen}
                aria-haspopup="true"
                onClick={(e) => {
                  e.stopPropagation()
                  setHelpMenuOpen(false)
                  setLangMenuOpen(false)
                  setServiceOpen((v) => !v)
                }}
              >
                <span className="popover-service-trigger-icon" aria-hidden>
                  ⏻
                </span>
                <span className="popover-service-trigger-label">{t('Ark.RestartAndShutdown')}</span>
                <span className="popover-service-trigger-chevron" aria-hidden>
                  {serviceOpen ? '◀' : '▶'}
                </span>
              </button>
            </div>

            {serviceOpen &&
              serviceFlyoutPos &&
              createPortal(
                <div
                  ref={serviceFlyoutRef}
                  className="popover-service-flyout popover-service-flyout--portal"
                  style={{ top: serviceFlyoutPos.top, left: serviceFlyoutPos.left }}
                  role="menu"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button type="button" className="popover-flyout-row" onClick={() => void onRestart()}>
                    <span className="popover-flyout-glyph" aria-hidden>
                      ⟳
                    </span>
                    <span>{t('Ark.RestartSync')}</span>
                  </button>
                  <button type="button" className="popover-flyout-row danger" onClick={() => void onShutdown()}>
                    <span className="popover-flyout-glyph" aria-hidden>
                      ⏻
                    </span>
                    <span>{t('Ark.ShutdownSync')}</span>
                  </button>
                  <button type="button" className="popover-flyout-row" onClick={onDisconnect}>
                    <span className="popover-flyout-glyph" aria-hidden>
                      ⧉
                    </span>
                    <span>{t('Ark.ExitApp')}</span>
                  </button>
                </div>,
                getPortalContainer()
              )}
          </div>

          <div className="popover-divider" />

          <div className="popover-section popover-section--flush">
            <div className="popover-help-anchor">
              <button
                ref={helpTriggerRef}
                type="button"
                className="popover-help-trigger"
                aria-expanded={helpMenuOpen}
                aria-haspopup="true"
                onClick={(e) => {
                  e.stopPropagation()
                  setServiceOpen(false)
                  setLangMenuOpen(false)
                  setHelpMenuOpen((v) => !v)
                }}
              >
                <span className="popover-help-trigger-icon" aria-hidden>
                  ❓
                </span>
                <span className="popover-help-trigger-label">{t('Ark.Help')}</span>
                <span className="popover-help-trigger-chevron" aria-hidden>
                  {helpMenuOpen ? '◀' : '▶'}
                </span>
              </button>
            </div>
          </div>

          {helpMenuOpen &&
            helpFlyoutPos &&
            createPortal(
              <div
                ref={helpFlyoutRef}
                className="popover-help-flyout popover-help-flyout--portal"
                style={{ top: helpFlyoutPos.top, left: helpFlyoutPos.left }}
                role="menu"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {HELP_MENU_GROUPS.map((group, gi) => (
                  <Fragment key={gi}>
                    {gi > 0 ? <hr className="popover-help-flyout-sep" /> : null}
                    {group.map((item) =>
                      item.kind === 'about' ? (
                        <button
                          key="about"
                          type="button"
                          className="popover-flyout-row popover-help-link"
                          onClick={() => {
                            navigate('/about')
                            close()
                          }}
                        >
                          <span className="popover-flyout-glyph" aria-hidden>
                            {item.glyph}
                          </span>
                          <span>{t(item.tkey)}</span>
                        </button>
                      ) : (
                        <button
                          key={item.url}
                          type="button"
                          className="popover-flyout-row popover-help-link"
                          onClick={() => openLink(item.url)}
                        >
                          <span className="popover-flyout-glyph" aria-hidden>
                            {item.glyph}
                          </span>
                          <span>{t(item.tkey)}</span>
                        </button>
                      )
                    )}
                  </Fragment>
                ))}
              </div>,
              getPortalContainer()
            )}

          {langMenuOpen &&
            langFlyoutPos &&
            createPortal(
              <div
                ref={langFlyoutRef}
                className="popover-lang-flyout popover-lang-flyout--portal"
                style={{ top: langFlyoutPos.top, left: langFlyoutPos.left }}
                role="listbox"
                aria-label={t('Ark.Language')}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="popover-lang-flyout-columns">
                  {readyLanguageOptions.map(({ code, label }) => (
                    <button
                      key={code}
                      type="button"
                      role="option"
                      aria-selected={
                        normalizeLangCode(i18n.resolvedLanguage ?? i18n.language) ===
                        normalizeLangCode(code)
                      }
                      className={`popover-lang-option${
                        normalizeLangCode(i18n.resolvedLanguage ?? i18n.language) ===
                        normalizeLangCode(code)
                          ? ' active'
                          : ''
                      }`}
                      onClick={() => {
                        void (async () => {
                          await applySyncthingLocale(code, true)
                          setLangMenuOpen(false)
                        })()
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {pendingLanguageOptions.length > 0 ? (
                  <div className="popover-lang-collapsed">
                    <button
                      type="button"
                      className="popover-lang-collapse-trigger"
                      aria-expanded={langMoreOpen}
                      onClick={() => setLangMoreOpen((v) => !v)}
                    >
                      {langMoreOpen
                        ? t('Ark.LanguageMoreCollapse', { defaultValue: '收起未完成语言' })
                        : t('Ark.LanguageMoreExpand', {
                            defaultValue: `更多语言（${pendingLanguageOptions.length}）`
                          })}
                    </button>
                    {langMoreOpen ? (
                      <div className="popover-lang-flyout-columns popover-lang-flyout-columns--collapsed">
                        {pendingLanguageOptions.map(({ code, label }) => (
                          <button
                            key={code}
                            type="button"
                            role="option"
                            className="popover-lang-option popover-lang-option--disabled"
                            disabled
                            aria-disabled
                            title={t('Ark.LanguageNotReadyTip', {
                              defaultValue: '该语言页面内容尚未完成国际化'
                            })}
                          >
                            {label}
                            <span className="popover-lang-option-note">
                              {t('Ark.LanguageNotReady', { defaultValue: '未完成' })}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>,
              getPortalContainer()
            )}

          <div className="popover-footer-qr">
            <button
              type="button"
              className="popover-footer-qr-btn"
              disabled={!client}
              onClick={openDeviceQrFromFooter}
            >
              {footerQr?.dataUrl ? (
                <img
                  src={footerQr.dataUrl}
                  alt=""
                  className="popover-footer-qr-thumb"
                  width={40}
                  height={40}
                />
              ) : (
                <span className="popover-footer-qr-placeholder" aria-hidden>
                  ▣
                </span>
              )}
              <span className="popover-footer-qr-label">{t('Ark.ShowQR')}</span>
            </button>
          </div>
        </div>
      )}

      {qrFor && <QrModal deviceId={qrFor} onClose={() => setQrFor(null)} />}
    </div>
  )
}
