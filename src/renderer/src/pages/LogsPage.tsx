import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConnection } from '../context/ConnectionContext'
import type { SystemLogLevelsResponse, SystemLogMessage } from '../api/types'

const LEVEL_ORDER = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const

/** 与官方 `syncthingController.js` `logging.content()` 相同格式 */
function formatLogLine(entry: SystemLogMessage): string {
  const when = entry.when ? entry.when.split('.')[0].replace('T', ' ') : ''
  const level = entry.level ?? ''
  return `${when} ${level} ${entry.message ?? ''}`
}

const levelLabelKey = (code: string): string => {
  switch (code) {
    case 'DEBUG':
      return 'Debug'
    case 'INFO':
      return 'Info'
    case 'WARN':
      return 'Warning'
    case 'ERROR':
      return 'Error'
    default:
      return code
  }
}

export default function LogsPage(): React.ReactElement {
  const { t } = useTranslation()
  const { client } = useConnection()
  const [tab, setTab] = useState<'log' | 'facilities'>('log')
  const [entries, setEntries] = useState<SystemLogMessage[]>([])
  const entriesRef = useRef<SystemLogMessage[]>([])
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const [initialFetchDone, setInitialFetchDone] = useState(false)
  const [fetchErr, setFetchErr] = useState<string | null>(null)

  const [facilities, setFacilities] = useState<SystemLogLevelsResponse | null>(null)
  const [facilitiesUpdating, setFacilitiesUpdating] = useState(false)
  const [facilitiesErr, setFacilitiesErr] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    entriesRef.current = entries
  }, [entries])

  const logText = useMemo(() => entries.map((e) => formatLogLine(e)).join('\n'), [entries])

  /* 受控 textarea 的 value 在 commit 后才更新，须在 layout 阶段后滚到底部（勿在 fetch 里 rAF，易早于 DOM） */
  useLayoutEffect(() => {
    if (tab !== 'log' || paused) {
      return
    }
    const ta = textareaRef.current
    if (!ta) {
      return
    }
    ta.scrollTop = ta.scrollHeight
  }, [entries, tab, paused])

  /* 与官方 `logging.fetch`：暂停时每 500ms 轮询一次是否恢复；否则 GET log 后 2000ms 再拉 */
  useEffect(() => {
    if (!client) {
      return
    }
    setEntries([])
    entriesRef.current = []
    setInitialFetchDone(false)
    setFetchErr(null)
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }

    const schedule = (ms: number, fn: () => void) => {
      clearTimer()
      timer = setTimeout(fn, ms)
    }

    const runFetch = async () => {
      if (cancelled || !client) {
        return
      }
      if (pausedRef.current) {
        schedule(500, () => void runFetch())
        return
      }
      try {
        const last =
          entriesRef.current.length > 0
            ? entriesRef.current[entriesRef.current.length - 1].when
            : undefined
        const data = await client.getSystemLog(last ? { since: last } : undefined)
        if (cancelled) {
          return
        }
        setFetchErr(null)
        const msgs = data.messages ?? []
        if (msgs.length > 0 && !pausedRef.current) {
          setEntries((prev) => {
            const next = [...prev, ...msgs]
            entriesRef.current = next
            return next
          })
        }
      } catch (e) {
        if (!cancelled) {
          setFetchErr(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (!cancelled) {
          setInitialFetchDone(true)
        }
      }
      if (!cancelled) {
        schedule(2000, () => void runFetch())
      }
    }

    schedule(0, () => void runFetch())

    return () => {
      cancelled = true
      clearTimer()
    }
  }, [client])

  const loadFacilities = useCallback(async () => {
    if (!client) {
      return
    }
    setFacilitiesErr(null)
    try {
      const data = await client.getSystemLogLevels()
      setFacilities(data)
    } catch (e) {
      setFacilities(null)
      setFacilitiesErr(e instanceof Error ? e.message : String(e))
    }
  }, [client])

  useEffect(() => {
    if (!client || tab !== 'facilities') {
      return
    }
    void loadFacilities()
  }, [client, tab, loadFacilities])

  const onLogScroll = () => {
    const ta = textareaRef.current
    if (!ta) {
      return
    }
    const { scrollTop, scrollHeight, clientHeight } = ta
    const atBottom = scrollHeight <= scrollTop + clientHeight + 2
    setPaused(!atBottom)
  }

  const scrollLogToBottom = () => {
    const ta = textareaRef.current
    if (!ta) {
      return
    }
    ta.scrollTop = ta.scrollHeight
    setPaused(false)
  }

  const onFacilityLevelChange = async (key: string, value: string) => {
    if (!client || !facilities) {
      return
    }
    const nextLevels = { ...facilities.levels, [key]: value }
    setFacilities({ ...facilities, levels: nextLevels })
    setFacilitiesUpdating(true)
    setFacilitiesErr(null)
    try {
      await client.setSystemLogLevels(nextLevels)
      const data = await client.getSystemLogLevels()
      setFacilities(data)
    } catch (e) {
      setFacilitiesErr(e instanceof Error ? e.message : String(e))
      await loadFacilities()
    } finally {
      setFacilitiesUpdating(false)
    }
  }

  const facilityKeys = useMemo(() => {
    if (!facilities?.levels) {
      return [] as string[]
    }
    return Object.keys(facilities.levels)
  }, [facilities])

  if (!client) {
    return <p className="muted">{t('Ark.FoldersNotConnected')}</p>
  }

  return (
    <div className="logs-page">
      <div className="settings-shell logs-page-shell">
        <header className="settings-shell-header logs-page-header">
          <div className="logs-page-header-titles">
            <span className="settings-shell-title-glyph" aria-hidden>
              🔧
            </span>
            <h1 className="settings-shell-title">{t('Logs')}</h1>
          </div>
        </header>

        <div className="logs-page-body">
          <div className="logs-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              id="logs-tab-log"
              aria-selected={tab === 'log'}
              className={`logs-tab ${tab === 'log' ? 'logs-tab--active' : ''}`}
              onClick={() => setTab('log')}
            >
              {t('Log')}
            </button>
            <button
              type="button"
              role="tab"
              id="logs-tab-facilities"
              aria-selected={tab === 'facilities'}
              className={`logs-tab ${tab === 'facilities' ? 'logs-tab--active' : ''}`}
              onClick={() => setTab('facilities')}
            >
              {t('Debugging Facilities')}
            </button>
          </div>

          {fetchErr && tab === 'log' ? <div className="error-banner">{fetchErr}</div> : null}

          {tab === 'log' ? (
            <div className="logs-tab-panel" role="tabpanel" aria-labelledby="logs-tab-log">
              {!initialFetchDone && entries.length === 0 ? (
                <p className="muted logs-page-loading">{t('Loading...')}</p>
              ) : (
                <textarea
                  ref={textareaRef}
                  id="logViewerText"
                  className="logs-page-textarea"
                  readOnly
                  rows={20}
                  value={logText}
                  onScroll={onLogScroll}
                  spellCheck={false}
                />
              )}
              <button
                type="button"
                className={`logs-page-paused-hint ${paused ? 'logs-page-paused-hint--visible' : ''}`}
                onClick={scrollLogToBottom}
              >
                {t('Log tailing paused. Scroll to the bottom to continue.')}
              </button>
            </div>
          ) : (
            <div className="logs-tab-panel" role="tabpanel" aria-labelledby="logs-tab-facilities">
              {facilitiesErr ? <div className="error-banner">{facilitiesErr}</div> : null}
              <p className="logs-facilities-intro muted">{t('Available debug logging facilities:')}</p>
              {facilities ? (
                <div className="logs-facilities-table-wrap">
                  <table className="logs-facilities-table">
                    <tbody>
                      {facilityKeys.map((key) => (
                        <tr key={key}>
                          <td className="logs-facilities-name">
                            {(facilities.packages[key] ?? key) + ' '}
                            (<code>{key}</code>)
                          </td>
                          <td>
                            <select
                              className="logs-facilities-select"
                              value={facilities.levels[key] ?? 'INFO'}
                              disabled={facilitiesUpdating}
                              onChange={(e) => void onFacilityLevelChange(key, e.target.value)}
                            >
                              {LEVEL_ORDER.map((lv) => (
                                <option key={lv} value={lv}>
                                  {t(levelLabelKey(lv))}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : !facilitiesErr ? (
                <p className="muted">{t('Loading...')}</p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
