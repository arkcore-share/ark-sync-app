import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LocalStateTotalStat } from '../components/ConnectionSignal'
import AddFolderModal from '../components/folder/AddFolderModal'
import EditFolderModal from '../components/folder/EditFolderModal'
import VersionsModal from '../components/folder/VersionsModal'
import { useConnection } from '../context/ConnectionContext'
import { exportAgentArtifactsToSyncTmp, isElectronApp } from '../electronBridge'
import { usePoll } from '../hooks/usePoll'
import type {
  DeviceConfiguration,
  FolderConfiguration,
  FolderStatisticsEntry,
  FolderSummary,
  SystemConfig
} from '../api/types'
import { formatBytes, resolveDeviceNameFromConfig, sameDeviceId } from '../util/format'
import {
  folderDisplayState,
  folderTypeLabel,
  formatIntervalSeconds,
  formatLastChange,
  formatLastScan,
  LAST_CHANGE_EMPTY_HINT,
  pullOrderLabel,
  versioningTypeLabel
} from '../util/syncthingUi'

type Row = {
  folder: FolderConfiguration
  status: FolderSummary | null
  stats: FolderStatisticsEntry | undefined
}

function FkWrap({ children, title }: { children: React.ReactNode; title?: string }): React.ReactElement {
  return (
    <span className="folder-kv-svg" title={title} aria-hidden>
      {children}
    </span>
  )
}

function IcoInfo(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M8 7.2V11M8 5h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function IcoGlobe(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M2 8h12M8 2c2 2.5 2 11.5 0 12M8 2c-2 2.5-2 11.5 0 12" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function IcoHome(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 7.5L8 3l5 4.5V13H3V7.5z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      <path d="M6 13V9h4v4" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  )
}

function IcoFolder(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 5h4l1 1h7v9H2V5z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
    </svg>
  )
}

function IcoFolderPath(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 5h4l1 1h7v8H2V5z" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M9 8l2 2-2 2M7 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function IcoList(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 4h9M4 8h9M4 12h9M2 4h.5M2 8h.5M2 12h.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function IcoRescan(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M5 4A5 5 0 0111 3l1.2 1M11 12a5 5 0 01-6 1l-1.2-1M3 8H1M15 8h-2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IcoClock(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M8 4.5V8l3 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function IcoEye(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2.5 8s2.5-4 5.5-4 5.5 4 5.5 4-2.5 4-5.5 4-5.5-4-5.5-4z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
      <circle cx="8" cy="8" r="1.8" fill="currentColor" />
    </svg>
  )
}

function IcoArrowsUD(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 2v12M5 5l3-3 3 3M5 11l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IcoLayers(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 5l6 3 6-3M2 8l6 3 6-3M2 11l6 3 6-3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
    </svg>
  )
}

function IcoSwap(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 5h8M4 11h8M10 3l2 2-2 2M6 13l-2-2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function IcoShareNodes(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <circle cx="11" cy="4" r="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <circle cx="11" cy="12" r="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M6.5 6.2l3.5 1.2M10 6.2L7 10.5" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}

function FolderKvRow({
  icon,
  label,
  children,
  valueClass
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
  valueClass?: string
}): React.ReactElement {
  return (
    <div className="kv-row folder-kv-row">
      <span className="kv-label">
        <span className="kv-icon folder-kv-icon-wrap">
          <FkWrap>{icon}</FkWrap>
        </span>
        {label}
      </span>
      <span className={['kv-value', valueClass || ''].filter(Boolean).join(' ')}>{children}</span>
    </div>
  )
}

function LastChangeValue({ stats }: { stats: FolderStatisticsEntry | undefined }): React.ReactElement {
  const text = formatLastChange(stats)
  if (text === '—') {
    return (
      <span className="muted last-change-dash" title={LAST_CHANGE_EMPTY_HINT}>
        —
      </span>
    )
  }
  return <span>{text}</span>
}

function RescanWatcherValue({ folder }: { folder: FolderConfiguration }): React.ReactElement {
  const interval = folder.rescanIntervalS ?? 3600
  const intervalStr = formatIntervalSeconds(interval)
  const watch = folder.fsWatcherEnabled !== false ? '已启用' : '已禁用'
  const enabledTip = '正在以给定的间隔进行定期扫描，并启用了更改监视'
  return (
    <span className="rescan-watcher-inline">
      <span className="rw-part">
        <FkWrap title="扫描间隔">
          <IcoClock />
        </FkWrap>
        {intervalStr}
      </span>
      <span className="rw-sep"> </span>
      <span className="rw-part">
        <FkWrap title="更改监视">
          <IcoEye />
        </FkWrap>{' '}
        {watch === '已启用' ? (
          <span title={enabledTip} className="rescan-watch-tip">
            {watch}
          </span>
        ) : (
          <span>{watch}</span>
        )}
      </span>
    </span>
  )
}

function VersioningSummaryCell({ folder }: { folder: FolderConfiguration }): React.ReactElement {
  const v = folder.versioning
  if (!v?.type) {
    return <>关闭</>
  }
  const p = v.params ?? {}
  const maxAge = p.maxAge ? parseInt(p.maxAge, 10) : 0
  const cleanFromParams = p.cleanInterval ? parseInt(p.cleanInterval, 10) : 0
  const cleanS =
    v.cleanupIntervalS && v.cleanupIntervalS > 0
      ? v.cleanupIntervalS
      : cleanFromParams > 0
        ? cleanFromParams
        : 0
  const internalTypes = ['staggered', 'simple', 'trashcan']
  const pathStr =
    p.versionsPath ||
    v.fsPath ||
    (internalTypes.includes(v.type) ? '.stversions' : '')

  return (
    <span className="versioning-summary-cell">
      <span>{versioningTypeLabel(v.type)}</span>
      {maxAge > 0 && (
        <>
          {' · '}
          <FkWrap>
            <span className="vw-emoji" aria-hidden>
              📅
            </span>
          </FkWrap>
          <span title="最长保留时间">{formatIntervalSeconds(maxAge)}</span>
        </>
      )}
      {cleanS > 0 && (
        <>
          {' · '}
          <FkWrap>
            <span className="vw-emoji" aria-hidden>
              ⟲
            </span>
          </FkWrap>
          <span title="清除间隔">{formatIntervalSeconds(cleanS)}</span>
        </>
      )}
      {pathStr ? (
        <>
          {' · '}
          <FkWrap title="版本路径">
            <IcoFolder />
          </FkWrap>
          <span>{pathStr}</span>
        </>
      ) : null}
    </span>
  )
}

function FolderCard({
  row,
  configDevices,
  myId,
  expanded,
  onToggleHead,
  onPause,
  onScan,
  onEdit,
  onVersions
}: {
  row: Row
  configDevices: DeviceConfiguration[]
  myId: string
  expanded: boolean
  onToggleHead: () => void
  onPause: () => void
  onScan: () => void
  onEdit: () => void
  onVersions: () => void
}): React.ReactElement {
  const { folder, status, stats } = row
  const st = folderDisplayState(folder, status)
  const shared = (folder.devices || [])
    .map((d) => d.deviceID)
    .filter((id) => !sameDeviceId(id, myId))
    .map((id) => ({
      id,
      name: resolveDeviceNameFromConfig(configDevices, id)
    }))

  const blockIdx = folder.blockIndexing !== false ? '是' : '否'
  const gFiles = status?.globalFiles ?? 0
  const gDirs = status?.globalDirectories ?? 0
  const gBytes = Number(status?.globalBytes ?? 0)
  const lFiles = status?.localFiles ?? 0
  const lDirs = status?.localDirectories ?? 0
  const lBytes = Number(status?.localBytes ?? 0)

  return (
    <div className="folder-card">
      <button
        type="button"
        className="folder-card-head folder-card-head-toggle"
        aria-expanded={expanded}
        onClick={onToggleHead}
      >
        <div className="folder-card-title">
          <span className="folder-card-icon" aria-hidden>
            📁
          </span>
          <span>{folder.label || folder.id}</span>
        </div>
        <span className={`folder-card-state ${st.ok ? 'ok' : 'warn'}`}>{st.label}</span>
      </button>
      {expanded && (
        <>
          <div className="folder-card-body kv-list">
            <FolderKvRow icon={<IcoInfo />} label="文件夹 ID" valueClass="kv-value-tr">
              <code>{folder.id}</code>
            </FolderKvRow>
            <FolderKvRow icon={<IcoFolderPath />} label="文件夹路径" valueClass="kv-value-tr path-val">
              {folder.path}
            </FolderKvRow>
            <FolderKvRow icon={<IcoGlobe />} label="全局状态" valueClass="kv-value-tr">
              {status ? (
                <LocalStateTotalStat files={gFiles} dirs={gDirs} bytes={gBytes} formatBytes={formatBytes} />
              ) : (
                '—'
              )}
            </FolderKvRow>
            <FolderKvRow icon={<IcoHome />} label="本地状态" valueClass="kv-value-tr">
              {status ? (
                <LocalStateTotalStat files={lFiles} dirs={lDirs} bytes={lBytes} formatBytes={formatBytes} />
              ) : (
                '—'
              )}
            </FolderKvRow>
            <FolderKvRow icon={<IcoFolder />} label="文件夹类型" valueClass="kv-value-tr">
              {folderTypeLabel(folder.type)}
            </FolderKvRow>
            <FolderKvRow icon={<IcoList />} label="块索引" valueClass="kv-value-tr">
              {blockIdx}
            </FolderKvRow>
            <FolderKvRow icon={<IcoRescan />} label="重新扫描" valueClass="kv-value-tr">
              <RescanWatcherValue folder={folder} />
            </FolderKvRow>
            <FolderKvRow icon={<IcoArrowsUD />} label="文件拉取顺序" valueClass="kv-value-tr">
              {pullOrderLabel(folder.order)}
            </FolderKvRow>
            <FolderKvRow icon={<IcoLayers />} label="文件版本控制" valueClass="kv-value-tr">
              <VersioningSummaryCell folder={folder} />
            </FolderKvRow>
            <FolderKvRow icon={<IcoShareNodes />} label="共享给" valueClass="kv-value-tr shared-with">
              {shared.length === 0 ? (
                <span className="muted">—</span>
              ) : (
                shared.map((s, i) => (
                  <span key={s.id}>
                    {i > 0 ? ', ' : ''}
                    <Link to="/devices" className="device-link">
                      {s.name}
                    </Link>
                  </span>
                ))
              )}
            </FolderKvRow>
            <FolderKvRow icon={<IcoClock />} label="最后扫描" valueClass="kv-value-tr">
              {formatLastScan(stats)}
            </FolderKvRow>
            <FolderKvRow icon={<IcoSwap />} label="最后更改" valueClass="kv-value-tr">
              <LastChangeValue stats={stats} />
            </FolderKvRow>
          </div>
          <div className="folder-card-actions row">
            <button type="button" onClick={onPause}>
              <span className="btn-glyph" aria-hidden>
                {folder.paused ? '▶' : '⏸'}
              </span>
              {folder.paused ? '恢复' : '暂停'}
            </button>
            <button type="button" onClick={onVersions}>
              <span className="btn-glyph" aria-hidden>
                ⟲
              </span>
              历史版本
            </button>
            <button type="button" onClick={onScan}>
              <span className="btn-glyph" aria-hidden>
                ↻
              </span>
              重新扫描
            </button>
            <button type="button" onClick={onEdit}>
              <span className="btn-glyph" aria-hidden>
                ✎
              </span>
              编辑
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function FoldersPage(): React.ReactElement {
  const { client } = useConnection()
  const [cfg, setCfg] = useState<SystemConfig | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [myId, setMyId] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editFolder, setEditFolder] = useState<FolderConfiguration | null>(null)
  const [versionsFolder, setVersionsFolder] = useState<string | null>(null)
  const [cardOpen, setCardOpen] = useState<Record<string, boolean>>({})
  const [statsWarn, setStatsWarn] = useState<string | null>(null)
  const [autoSyncBanner, setAutoSyncBanner] = useState<string | null>(null)
  const [agentProbeBusy, setAgentProbeBusy] = useState(false)
  const folderStatsRef = useRef<Record<string, FolderStatisticsEntry>>({})

  const toggleCard = (folderId: string) => {
    setCardOpen((prev) => ({
      ...prev,
      [folderId]: !(prev[folderId] ?? false)
    }))
  }

  const load = useCallback(async () => {
    if (!client) {
      return
    }
    setErr(null)
    try {
      const [config, st] = await Promise.all([client.getConfig(), client.systemStatus()])
      let folderStats = folderStatsRef.current
      try {
        folderStats = await client.getFolderStatisticsMap()
        folderStatsRef.current = folderStats
        setStatsWarn(null)
      } catch (e) {
        folderStats = folderStatsRef.current
        setStatsWarn(
          e instanceof Error
            ? `无法刷新文件夹统计（${e.message}）；「最后更改」等可能仍为「—」或沿用上次数据。`
            : '无法刷新文件夹统计；「最后更改」等可能仍为「—」或沿用上次数据。'
        )
      }
      setCfg(config)
      setMyId(st.myID.trim())
      const list = config.folders || []
      const statuses = await Promise.all(
        list.map(async (f) => {
          try {
            const status = await client.folderStatus(f.id)
            return {
              folder: f,
              status,
              stats: folderStats?.[f.id]
            }
          } catch {
            return { folder: f, status: null, stats: folderStats?.[f.id] }
          }
        })
      )
      setRows(statuses)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }, [client])

  usePoll(load, 10_000, !!client)

  const remoteDevices = useMemo(
    () => (cfg?.devices || []).filter((d) => !sameDeviceId(d.deviceID, myId)),
    [cfg, myId]
  )

  const actions = async (fn: () => Promise<void>) => {
    try {
      await fn()
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  const pauseAll = () => {
    if (!client || !confirm('暂停所有文件夹？')) {
      return
    }
    void actions(() => client.setAllFoldersPaused(true))
  }

  const resumeAll = () => {
    if (!client || !confirm('恢复所有已暂停的文件夹？')) {
      return
    }
    void actions(() => client.setAllFoldersPaused(false))
  }

  const scanAll = () => {
    if (!client) {
      return
    }
    void actions(() => client.scanAllFolders())
  }

  const probeAgentFolders = () => {
    if (!client || !isElectronApp() || agentProbeBusy) {
      return
    }
    setAgentProbeBusy(true)
    void (async () => {
      try {
        const sourceDeviceName = cfg?.devices.find((d) => sameDeviceId(d.deviceID, myId))?.name
        const r = await exportAgentArtifactsToSyncTmp({
          sourceDeviceId: myId,
          sourceDeviceName
        })
        if (!r) {
          setAutoSyncBanner('请在 Electron 桌面窗口中执行智能体资料导出。')
          window.setTimeout(() => setAutoSyncBanner(null), 12_000)
          return
        }
        const errorText = r.errors.length > 0 ? ` 部分失败 ${r.errors.length} 项。` : ''
        setAutoSyncBanner(
          `已复制 ${r.entries} 个智能体条目到 ${r.targetRoot}，文件 ${r.copiedFiles} 个、目录 ${r.copiedDirs} 个；清单已写入 ${r.manifestPath}。${errorText}`
        )
        window.setTimeout(() => setAutoSyncBanner(null), 25_000)
      } finally {
        setAgentProbeBusy(false)
      }
    })()
  }

  if (!client) {
    return <p className="muted">未连接</p>
  }

  const anyPaused = rows.some((r) => r.folder.paused)

  return (
    <div className="folders-page">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>文件夹</h1>
        <div className="row folder-global-actions">
          <button type="button" onClick={() => (anyPaused ? resumeAll() : pauseAll())}>
            <span className="btn-glyph" aria-hidden>
              {anyPaused ? '▶' : '⏸'}
            </span>
            {anyPaused ? '恢复全部' : '暂停全部'}
          </button>
          <button type="button" onClick={() => void scanAll()}>
            <span className="btn-glyph" aria-hidden>
              ↻
            </span>
            全部重新扫描
          </button>
          {isElectronApp() ? (
            <button
              type="button"
              onClick={() => probeAgentFolders()}
              disabled={agentProbeBusy}
              title="扫描本机智能体资料，将 Skill、Memory、Files 复制到 ~/.sync_tmp 并生成跨系统恢复清单"
            >
              <span className="btn-glyph" aria-hidden>
                ⊕
              </span>
              {agentProbeBusy ? '正在导出…' : '从智能体扫描添加'}
            </button>
          ) : null}
          <button type="button" className="primary" onClick={() => setShowAdd(true)}>
            <span className="btn-glyph" aria-hidden>
              ＋
            </span>
            添加文件夹
          </button>
        </div>
      </div>
      {err && <div className="error-banner">{err}</div>}
      {autoSyncBanner && (
        <div
          className="error-banner"
          style={{ borderColor: 'rgba(34, 197, 94, 0.45)', color: '#bbf7d0', background: 'rgba(22, 163, 74, 0.12)' }}
        >
          {autoSyncBanner}
        </div>
      )}
      {statsWarn && (
        <div className="error-banner" style={{ borderColor: 'rgba(234, 179, 8, 0.45)', color: 'var(--warning)' }}>
          {statsWarn}
        </div>
      )}

      <div className="folder-card-list">
        {rows.map((row) => (
          <FolderCard
            key={row.folder.id}
            row={row}
            configDevices={cfg?.devices ?? []}
            myId={myId}
            expanded={cardOpen[row.folder.id] ?? false}
            onToggleHead={() => toggleCard(row.folder.id)}
            onPause={() =>
              void actions(() => client.setFolderPaused(row.folder.id, !row.folder.paused))
            }
            onScan={() => void actions(() => client.scanFolder(row.folder.id))}
            onEdit={() => setEditFolder(row.folder)}
            onVersions={() => setVersionsFolder(row.folder.id)}
          />
        ))}
      </div>

      {rows.length === 0 && !err && <p className="muted">暂无文件夹，点击「添加文件夹」创建。</p>}

      {showAdd && myId && (
        <AddFolderModal
          myId={myId}
          devices={remoteDevices}
          onClose={() => setShowAdd(false)}
          onSave={() => void load()}
        />
      )}

      {editFolder && myId && (
        <EditFolderModal
          folder={editFolder}
          myId={myId}
          devices={remoteDevices}
          onClose={() => setEditFolder(null)}
          onSaved={() => void load()}
        />
      )}

      {versionsFolder && (
        <VersionsModal folderId={versionsFolder} onClose={() => setVersionsFolder(null)} />
      )}
    </div>
  )
}
