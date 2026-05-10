import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useConnection } from '../context/ConnectionContext'
import { usePoll } from '../hooks/usePoll'
import type {
  DeviceConfiguration,
  FolderConfiguration,
  GuiConfiguration,
  ObservedFolder,
  ObservedRemoteDevice,
  SystemConfig,
  SystemStatus,
  SystemVersionResponse
} from '../api/types'
import { sameDeviceId, shortDeviceId } from '../util/format'

const DOCS_BASE = 'https://docs.syncthing.net/'
const GUI_THEMES = ['default', 'dark', 'black', 'light']

type SettingsTab = 'general' | 'gui' | 'connections' | 'ignoredDevices' | 'ignoredFolders'

/** 与官方 GUI 相同：差异视图由两次 `/svc/report?version=` 对比；仅输出新版中新增或内容变化的字段（值取当前版本） */
function diffUsageReports(
  current: Record<string, unknown>,
  previous: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(current)) {
    const a = current[k]
    const b = previous[k]
    if (b === undefined || JSON.stringify(a) !== JSON.stringify(b)) {
      out[k] = a
    }
  }
  return out
}

function randomApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-'
  let s = ''
  for (let i = 0; i < 40; i++) {
    s += chars[Math.floor(Math.random() * chars.length)]
  }
  return s
}

function parseMinHomeDiskFree(v: unknown): { value: number; unit: string } {
  if (v && typeof v === 'object' && v !== null && 'value' in v && 'unit' in v) {
    const o = v as { value: unknown; unit: unknown }
    return { value: Number(o.value) || 0, unit: String(o.unit || '%') }
  }
  if (typeof v === 'string') {
    const m = v.trim().match(/^([\d.]+)\s*(.*)$/)
    if (m) {
      return { value: parseFloat(m[1]), unit: m[2].trim() || '%' }
    }
  }
  return { value: 1, unit: '%' }
}

function joinList(v: unknown): string {
  if (Array.isArray(v)) {
    return v.map(String).join(' ')
  }
  return v != null ? String(v) : ''
}

function splitAddrList(s: string): string[] {
  return s
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

function buildOptionsForSave(
  base: Record<string, unknown>,
  params: {
    listenStr: string
    globalAnnStr: string
    minDiskVal: number
    minDiskUnit: string
    urStr: string
    upgrades: 'none' | 'stable' | 'candidate'
    urVersionMax?: number
    isCandidate?: boolean
  }
): Record<string, unknown> {
  const o = { ...base }
  const listen = splitAddrList(params.listenStr)
  o.listenAddresses = listen.length ? listen : ['default']
  const ga = splitAddrList(params.globalAnnStr)
  o.globalAnnounceServers = ga.length ? ga : ['default']
  o.minHomeDiskFree = { value: params.minDiskVal, unit: params.minDiskUnit }
  o.urAccepted = parseInt(params.urStr, 10) || 0

  if (params.upgrades === 'candidate') {
    const h = typeof o.autoUpgradeIntervalH === 'number' && o.autoUpgradeIntervalH > 0 ? o.autoUpgradeIntervalH : 12
    o.autoUpgradeIntervalH = h
    o.upgradeToPreReleases = true
    if (params.urVersionMax != null) {
      o.urAccepted = params.urVersionMax
      o.urSeen = params.urVersionMax
    }
  } else if (params.upgrades === 'stable') {
    const h = typeof o.autoUpgradeIntervalH === 'number' && o.autoUpgradeIntervalH > 0 ? o.autoUpgradeIntervalH : 12
    o.autoUpgradeIntervalH = h
    o.upgradeToPreReleases = false
  } else {
    o.autoUpgradeIntervalH = 0
    o.upgradeToPreReleases = false
  }

  if (params.isCandidate && params.urVersionMax != null) {
    o.urAccepted = params.urVersionMax
    o.urSeen = params.urVersionMax
  }

  return o
}

function folderLabelForId(folders: FolderConfiguration[], folderId: string): string {
  const f = folders.find((x) => x.id === folderId)
  return f?.label || folderId
}

/** 与官方 GUI `isUnixAddress` 一致：Unix 套接字监听时需配置权限 */
function isUnixGuiAddress(address: string): boolean {
  const a = address.trim()
  return a.startsWith('/') || a.startsWith('unix://') || a.startsWith('unixs://')
}

export default function SettingsPage(): React.ReactElement {
  const { t } = useTranslation()
  const { client } = useConnection()
  const navigate = useNavigate()
  const [tab, setTab] = useState<SettingsTab>('general')
  const [draft, setDraft] = useState<SystemConfig | null>(null)
  const [myId, setMyId] = useState('')
  const [sys, setSys] = useState<SystemStatus | null>(null)
  /** 与官方 Web GUI 相同：`isCandidate` 来自 GET /rest/system/version，不在 /system/status */
  const [versionInfo, setVersionInfo] = useState<SystemVersionResponse | null>(null)
  const [listenStr, setListenStr] = useState('')
  const [globalAnnStr, setGlobalAnnStr] = useState('')
  const [deviceName, setDeviceName] = useState('')
  const [minDiskVal, setMinDiskVal] = useState(1)
  const [minDiskUnit, setMinDiskUnit] = useState('%')
  const [urStr, setUrStr] = useState('0')
  const [upgrades, setUpgrades] = useState<'none' | 'stable' | 'candidate'>('stable')
  const [guiPasswordInput, setGuiPasswordInput] = useState('')
  /** 配置中是否已有 GUI 密码（GET /config 通常为哈希，仅用于占位提示，不参与保存合并） */
  const [guiPasswordConfigured, setGuiPasswordConfigured] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [urPreviewOpen, setUrPreviewOpen] = useState(false)
  const [urPreviewJson, setUrPreviewJson] = useState('')
  const [urPreviewBusy, setUrPreviewBusy] = useState(false)
  const [urPreviewVersion, setUrPreviewVersion] = useState<number | null>(null)
  const [urPreviewDiff, setUrPreviewDiff] = useState(false)
  const [defaultsModal, setDefaultsModal] = useState<'folder' | 'device' | null>(null)
  const [defaultsJson, setDefaultsJson] = useState('')

  const load = useCallback(async () => {
    if (!client) {
      return
    }
    setErr(null)
    try {
      const [cfg, st, version] = await Promise.all([
        client.getConfig(),
        client.systemStatus(),
        client.systemVersion().catch((): SystemVersionResponse => ({}))
      ])
      setMyId(st.myID.trim())
      setSys(st)
      setVersionInfo(version)
      setDraft(JSON.parse(JSON.stringify(cfg)) as SystemConfig)

      const me = cfg.devices.find((d) => sameDeviceId(d.deviceID, st.myID.trim()))
      setDeviceName(me?.name ?? '')

      setListenStr(joinList(cfg.options?.listenAddresses))
      setGlobalAnnStr(joinList(cfg.options?.globalAnnounceServers))
      const md = parseMinHomeDiskFree(cfg.options?.minHomeDiskFree)
      setMinDiskVal(md.value)
      setMinDiskUnit(md.unit)

      setUrStr(String(cfg.options?.urAccepted ?? 0))
      const auh = Number(cfg.options?.autoUpgradeIntervalH ?? 0)
      const pre = !!cfg.options?.upgradeToPreReleases
      setUpgrades(pre ? 'candidate' : auh > 0 ? 'stable' : 'none')

      const gp = (cfg.gui?.password as string | undefined) ?? ''
      setGuiPasswordConfigured(typeof gp === 'string' && gp.length > 0)
      setGuiPasswordInput('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setDraft(null)
      setVersionInfo(null)
    }
  }, [client])

  usePoll(load, 60_000, !!client)

  const ignoredDevices = draft?.remoteIgnoredDevices ?? []
  const ignoredFolderCount = useMemo(() => {
    if (!draft?.devices) {
      return 0
    }
    return draft.devices.reduce((n, d) => n + (d.ignoredFolders?.length ?? 0), 0)
  }, [draft])

  const ignoredFolderRows = useMemo(() => {
    if (!draft) {
      return [] as { deviceId: string; deviceLabel: string; folder: ObservedFolder }[]
    }
    const rows: { deviceId: string; deviceLabel: string; folder: ObservedFolder }[] = []
    for (const d of draft.devices) {
      for (const f of d.ignoredFolders ?? []) {
        rows.push({
          deviceId: d.deviceID,
          deviceLabel: d.name || shortDeviceId(d.deviceID),
          folder: f
        })
      }
    }
    return rows
  }, [draft])

  const isCandidate = !!versionInfo?.isCandidate
  const urMax = sys?.urVersionMax ?? 3
  const urVersionOptions = useMemo(() => {
    const out: number[] = []
    for (let i = urMax; i >= 2; i--) {
      out.push(i)
    }
    return out
  }, [urMax])

  const openDefaults = (kind: 'folder' | 'device') => {
    if (!draft) {
      return
    }
    const def = (draft.defaults ?? {}) as Record<string, unknown>
    const inner = (def[kind] ?? {}) as Record<string, unknown>
    setDefaultsJson(JSON.stringify(inner, null, 2))
    setDefaultsModal(kind)
  }

  const saveDefaultsModal = () => {
    if (!defaultsModal || !draft) {
      return
    }
    try {
      const parsed = JSON.parse(defaultsJson) as Record<string, unknown>
      setDraft((d) => {
        if (!d) {
          return d
        }
        const nextDef = { ...(d.defaults ?? {}) } as Record<string, unknown>
        nextDef[defaultsModal] = parsed
        return { ...d, defaults: nextDef }
      })
      setDefaultsModal(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  const unignoreDevice = (id: string) => {
    setDraft((d) => {
      if (!d) {
        return d
      }
      const list = (d.remoteIgnoredDevices ?? []).filter((x) => !sameDeviceId(x.deviceID, id))
      return { ...d, remoteIgnoredDevices: list }
    })
  }

  const unignoreFolder = (deviceId: string, folderId: string) => {
    setDraft((d) => {
      if (!d) {
        return d
      }
      return {
        ...d,
        devices: d.devices.map((dev) => {
          if (!sameDeviceId(dev.deviceID, deviceId)) {
            return dev
          }
          return {
            ...dev,
            ignoredFolders: (dev.ignoredFolders ?? []).filter((x) => x.id !== folderId)
          }
        })
      }
    })
  }

  const saveAll = async () => {
    if (!client || !draft || !myId) {
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const out = JSON.parse(JSON.stringify(draft)) as SystemConfig
      const di = out.devices.findIndex((d) => sameDeviceId(d.deviceID, myId))
      if (di >= 0) {
        out.devices[di] = { ...out.devices[di], name: deviceName.trim() }
      }

      out.options = buildOptionsForSave(out.options ?? {}, {
        listenStr,
        globalAnnStr,
        minDiskVal,
        minDiskUnit,
        urStr,
        upgrades,
        urVersionMax: sys?.urVersionMax,
        isCandidate: !!versionInfo?.isCandidate
      })

      const gui: GuiConfiguration = { ...(out.gui ?? {}) }
      // 与官方 Web GUI 一致：密码框内容原样提交，留空即清空 gui.password
      gui.password = guiPasswordInput
      out.gui = gui

      await client.setConfig(out)
      await load()
      alert('设置已保存。部分项需重启 Ark Sync 后生效。')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const refreshUrPreview = useCallback(async () => {
    if (!client || !urPreviewOpen) {
      return
    }
    if (urPreviewVersion == null) {
      setUrPreviewJson('')
      return
    }
    if (urVersionOptions.length > 0 && !urVersionOptions.includes(urPreviewVersion)) {
      setUrPreviewJson('')
      return
    }
    setUrPreviewBusy(true)
    try {
      const v = urPreviewVersion
      if (urPreviewDiff && v > 1) {
        const [cur, prev] = await Promise.all([
          client.getUsageReportPreview(v),
          client.getUsageReportPreview(v - 1)
        ])
        const d = diffUsageReports(cur, prev)
        setUrPreviewJson(JSON.stringify(d, null, 2))
      } else {
        const data = await client.getUsageReportPreview(v > 0 ? v : undefined)
        setUrPreviewJson(JSON.stringify(data, null, 2))
      }
    } catch (e) {
      setUrPreviewJson(e instanceof Error ? e.message : String(e))
    } finally {
      setUrPreviewBusy(false)
    }
  }, [client, urPreviewOpen, urPreviewDiff, urPreviewVersion, urVersionOptions])

  useEffect(() => {
    if (urPreviewOpen) {
      void refreshUrPreview()
    }
  }, [urPreviewOpen, urPreviewDiff, urPreviewVersion, refreshUrPreview])

  /** 打开预览时选中合法版本；下拉「选择版本」时 urPreviewVersion 为 null，不请求接口 */
  useEffect(() => {
    if (!urPreviewOpen || urPreviewVersion === null) {
      return
    }
    if (urVersionOptions.length > 0 && !urVersionOptions.includes(urPreviewVersion)) {
      setUrPreviewVersion(urVersionOptions[0]!)
    }
  }, [urPreviewOpen, urPreviewVersion, urVersionOptions])

  const loadUrPreview = () => {
    if (!client) {
      return
    }
    const parsed = parseInt(urStr, 10)
    const pick =
      urVersionOptions.includes(parsed) ? parsed : urVersionOptions.length ? urVersionOptions[0] : urMax
    setUrPreviewVersion(pick)
    setUrPreviewDiff(false)
    setUrPreviewOpen(true)
  }

  /** 固定高度的 JSON 区仅在已选具体版本且存在可选列表时使用；选「选择版本」时用紧凑布局避免大块空白 */
  const urPreviewModalExpanded = urPreviewVersion != null && urVersionOptions.length > 0

  const updateGui = (patch: Partial<GuiConfiguration>) => {
    setDraft((d) => (d ? { ...d, gui: { ...d.gui, ...patch } } : d))
  }

  const updateOption = (key: string, value: unknown) => {
    setDraft((d) => {
      if (!d) {
        return d
      }
      return { ...d, options: { ...(d.options ?? {}), [key]: value } }
    })
  }

  if (!client) {
    return <p className="muted">未连接</p>
  }

  return (
    <div className="settings-page">
      <div className="settings-shell">
        <header className="settings-shell-header">
          <span className="settings-shell-title-glyph" aria-hidden>
            ⚙
          </span>
          <h1 className="settings-shell-title">设置</h1>
        </header>

        {err && <div className="error-banner">{err}</div>}

        <nav className="settings-tabs" role="tablist" aria-label="设置分类">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'general'}
            className={`settings-tab${tab === 'general' ? ' active' : ''}`}
            onClick={() => setTab('general')}
          >
            <span className="settings-tab-glyph" aria-hidden>
              ⚙
            </span>
            常规
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'gui'}
            className={`settings-tab${tab === 'gui' ? ' active' : ''}`}
            onClick={() => setTab('gui')}
          >
            <span className="settings-tab-glyph" aria-hidden>
              🖥
            </span>
            GUI
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'connections'}
            className={`settings-tab${tab === 'connections' ? ' active' : ''}`}
            onClick={() => setTab('connections')}
          >
            <span className="settings-tab-glyph" aria-hidden>
              🔗
            </span>
            连接
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'ignoredDevices'}
            className={`settings-tab${tab === 'ignoredDevices' ? ' active' : ''}`}
            onClick={() => setTab('ignoredDevices')}
          >
            <span className="settings-tab-glyph" aria-hidden>
              💻
            </span>
            忽略的设备
            <span className="settings-tab-badge">{ignoredDevices.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'ignoredFolders'}
            className={`settings-tab${tab === 'ignoredFolders' ? ' active' : ''}`}
            onClick={() => setTab('ignoredFolders')}
          >
            <span className="settings-tab-glyph" aria-hidden>
              📁
            </span>
            忽略的文件夹
            <span className="settings-tab-badge">{ignoredFolderCount}</span>
          </button>
        </nav>

        <div className="settings-body">
          {!draft && <p className="muted">正在加载配置…</p>}

          {draft && tab === 'general' && (
            <div className="settings-panel">
              <div className="settings-field">
                <label htmlFor="settings-device-name">设备名</label>
                <input
                  id="settings-device-name"
                  className="settings-input-full"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                />
              </div>

              <div className="settings-two-col">
                <div className="settings-field">
                  <label htmlFor="settings-min-disk">最低空闲磁盘空间</label>
                  <div className="settings-inline-num-unit">
                    <input
                      id="settings-min-disk"
                      type="number"
                      min={0}
                      step="0.01"
                      value={minDiskVal}
                      onChange={(e) => setMinDiskVal(parseFloat(e.target.value) || 0)}
                    />
                    <select value={minDiskUnit} onChange={(e) => setMinDiskUnit(e.target.value)}>
                      <option value="%">%</option>
                      <option value="kB">kB</option>
                      <option value="MB">MB</option>
                      <option value="GB">GB</option>
                      <option value="TB">TB</option>
                    </select>
                  </div>
                  <p className="field-help">此设置控制主磁盘（即索引数据库）上所需的可用空间。</p>
                </div>
                <div className="settings-field">
                  <label>API 密钥</label>
                  <div className="settings-input-with-btn">
                    <input readOnly className="mono" value={draft.gui?.apiKey || ''} />
                    <button
                      type="button"
                      onClick={() => updateGui({ apiKey: randomApiKey() })}
                      title="生成新密钥"
                    >
                      生成
                    </button>
                  </div>
                </div>
              </div>

              <div className="settings-two-col">
                <div className="settings-field settings-ur-field">
                  {/* 与官方一致：label 只对应「匿名使用报告」；(预览) 在 label 外，为链接样式 */}
                  <div className="settings-ur-heading">
                    {!isCandidate && upgrades !== 'candidate' ? (
                      <label className="settings-ur-title" htmlFor="settings-ur-version-select">
                        匿名使用报告
                      </label>
                    ) : (
                      <span className="settings-ur-title">匿名使用报告</span>
                    )}
                    {' ('}
                    <button
                      type="button"
                      className="link-btn settings-ur-preview-btn"
                      disabled={urPreviewBusy}
                      onClick={() => void loadUrPreview()}
                    >
                      预览
                    </button>
                    {')'}
                  </div>
                  {!isCandidate && upgrades !== 'candidate' ? (
                    <select
                      id="settings-ur-version-select"
                      className="settings-ur-version-select"
                      value={urStr}
                      onChange={(e) => setUrStr(e.target.value)}
                    >
                      {urVersionOptions.map((n) => (
                        <option key={n} value={String(n)}>
                          版本 {n}
                        </option>
                      ))}
                      <option value="0">未决定（将提示）</option>
                      <option value="-1">禁用</option>
                    </select>
                  ) : (
                    <p className="field-help settings-ur-candidate-hint">
                      发布候选版始终启用使用报告。
                    </p>
                  )}
                </div>
                <div className="settings-field">
                  <label>
                    自动升级{' '}
                    <a href={`${DOCS_BASE}users/releases`} target="_blank" rel="noreferrer">
                      ? 帮助
                    </a>
                  </label>
                  <select value={upgrades} onChange={(e) => setUpgrades(e.target.value as 'none' | 'stable' | 'candidate')}>
                    {!isCandidate ? <option value="none">不升级</option> : null}
                    <option value="stable">仅稳定版本</option>
                    <option value="candidate">稳定版与发布候选版</option>
                  </select>
                  {isCandidate ? (
                    <p className="field-help">候选版本始终启用自动升级。</p>
                  ) : null}
                </div>
              </div>

              <div className="settings-field settings-defaults-block">
                <label>默认配置</label>
                <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button type="button" className="muted-btn" onClick={() => openDefaults('folder')}>
                    编辑文件夹默认值
                  </button>
                  <button type="button" className="muted-btn" onClick={() => openDefaults('device')}>
                    编辑设备默认值
                  </button>
                </div>
              </div>
            </div>
          )}

          {draft && tab === 'gui' && (
            <div className="settings-panel">
              {sys?.guiAddressOverridden ? (
                <p className="field-help" style={{ color: 'var(--warning)' }}>
                  GUI 监听地址已被启动参数覆盖，此处修改在覆盖生效期间可能无效。
                </p>
              ) : null}
              <div className="settings-field">
                <label htmlFor="settings-gui-addr">
                  GUI 监听地址{' '}
                  <a href={`${DOCS_BASE}users/guilisten`} target="_blank" rel="noreferrer">
                    ? 帮助
                  </a>
                </label>
                <input
                  id="settings-gui-addr"
                  className="settings-input-full"
                  value={draft.gui?.address ?? ''}
                  onChange={(e) => updateGui({ address: e.target.value })}
                />
              </div>
              <div className="settings-two-col">
                <div className="settings-field">
                  <label htmlFor="settings-gui-user">GUI 身份验证用户</label>
                  <input
                    id="settings-gui-user"
                    className="settings-input-full"
                    autoComplete="username"
                    value={draft.gui?.user ?? ''}
                    onChange={(e) => updateGui({ user: e.target.value })}
                  />
                </div>
                <div className="settings-field">
                  <label htmlFor="settings-gui-pass">GUI 身份验证密码</label>
                  <input
                    id="settings-gui-pass"
                    type="password"
                    className="settings-input-full"
                    autoComplete="new-password"
                    value={guiPasswordInput}
                    placeholder={
                      guiPasswordConfigured ? '留空并保存将清除密码；填写则为新密码' : ''
                    }
                    onChange={(e) => setGuiPasswordInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="settings-two-col">
                <div className="settings-field checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={!!draft.gui?.useTLS}
                      onChange={(e) => updateGui({ useTLS: e.target.checked })}
                    />
                    使用 HTTPS 连接到 GUI
                  </label>
                </div>
                <div className="settings-field checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={!!draft.options?.startBrowser}
                      onChange={(e) => updateOption('startBrowser', e.target.checked)}
                    />
                    启动浏览器
                  </label>
                </div>
              </div>
              {isUnixGuiAddress(draft.gui?.address ?? '') ? (
                <div className="settings-two-col">
                  <div className="settings-field">
                    <label htmlFor="settings-gui-theme">GUI 主题</label>
                    <select
                      id="settings-gui-theme"
                      value={draft.gui?.theme ?? 'default'}
                      onChange={(e) => updateGui({ theme: e.target.value })}
                    >
                      {GUI_THEMES.map((t) => (
                        <option key={t} value={t}>
                          {t === 'default' ? '默认' : t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="settings-field">
                    <label htmlFor="settings-unix-socket-perm">UNIX 套接字权限</label>
                    <input
                      id="settings-unix-socket-perm"
                      className="settings-input-full mono"
                      value={draft.gui?.unixSocketPermissions ?? ''}
                      placeholder="0660"
                      onChange={(e) => updateGui({ unixSocketPermissions: e.target.value })}
                    />
                    <p className="field-help">最多三位八进制数字（与官方设置一致）。</p>
                  </div>
                </div>
              ) : (
                <div className="settings-field">
                  <label htmlFor="settings-gui-theme-only">GUI 主题</label>
                  <select
                    id="settings-gui-theme-only"
                    value={draft.gui?.theme ?? 'default'}
                    onChange={(e) => updateGui({ theme: e.target.value })}
                  >
                    {GUI_THEMES.map((t) => (
                      <option key={t} value={t}>
                        {t === 'default' ? '默认' : t}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {draft && tab === 'connections' && (
            <div className="settings-panel">
              <div className="settings-field">
                <label htmlFor="settings-listen">
                  同步协议监听地址{' '}
                  <a href={`${DOCS_BASE}users/config#listen-addresses`} target="_blank" rel="noreferrer">
                    ? 帮助
                  </a>
                </label>
                <input
                  id="settings-listen"
                  className="settings-input-full mono"
                  value={listenStr}
                  onChange={(e) => setListenStr(e.target.value)}
                />
              </div>
              <div className="settings-two-col">
                <div className="settings-field">
                  <label htmlFor="settings-max-in">传入速率限制 (KiB/s)</label>
                  <input
                    id="settings-max-in"
                    type="number"
                    min={0}
                    step={1024}
                    value={Number(draft.options?.maxRecvKbps ?? 0)}
                    onChange={(e) => updateOption('maxRecvKbps', parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div className="settings-field">
                  <label htmlFor="settings-max-out">传出速率限制 (KiB/s)</label>
                  <input
                    id="settings-max-out"
                    type="number"
                    min={0}
                    step={1024}
                    value={Number(draft.options?.maxSendKbps ?? 0)}
                    onChange={(e) => updateOption('maxSendKbps', parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </div>
              <div className="settings-field checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={!!draft.options?.limitBandwidthInLan}
                    onChange={(e) => updateOption('limitBandwidthInLan', e.target.checked)}
                  />
                  在局域网内限制带宽
                </label>
              </div>
              <div className="settings-two-col">
                <div className="settings-field checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.options?.natEnabled !== false}
                      onChange={(e) => updateOption('natEnabled', e.target.checked)}
                    />
                    启用 NAT 穿透
                  </label>
                </div>
                <div className="settings-field checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.options?.localAnnounceEnabled !== false}
                      onChange={(e) => updateOption('localAnnounceEnabled', e.target.checked)}
                    />
                    本地发现
                  </label>
                </div>
              </div>
              <div className="settings-two-col">
                <div className="settings-field checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.options?.globalAnnounceEnabled !== false}
                      onChange={(e) => updateOption('globalAnnounceEnabled', e.target.checked)}
                    />
                    全局发现
                  </label>
                </div>
                <div className="settings-field checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.options?.relaysEnabled !== false}
                      onChange={(e) => updateOption('relaysEnabled', e.target.checked)}
                    />
                    启用中继
                  </label>
                </div>
              </div>
              <div className="settings-field">
                <label htmlFor="settings-global-ann">全局发现服务器</label>
                <input
                  id="settings-global-ann"
                  className="settings-input-full mono"
                  disabled={draft.options?.globalAnnounceEnabled === false}
                  value={globalAnnStr}
                  onChange={(e) => setGlobalAnnStr(e.target.value)}
                />
              </div>
            </div>
          )}

          {draft && tab === 'ignoredDevices' && (
            <div className="settings-panel">
              {ignoredDevices.length === 0 ? (
                <p className="muted">您没有忽略的设备。</p>
              ) : (
                <div className="settings-table-wrap">
                  <table className="settings-table">
                    <thead>
                      <tr>
                        <th>忽略时间</th>
                        <th>设备</th>
                        <th>地址</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {ignoredDevices.map((row: ObservedRemoteDevice) => (
                        <tr key={row.deviceID}>
                          <td>{row.time ? new Date(row.time).toLocaleString() : '—'}</td>
                          <td title={row.deviceID}>{row.name || shortDeviceId(row.deviceID)}</td>
                          <td className="mono">{row.address || '—'}</td>
                          <td>
                            <button type="button" className="link-btn" onClick={() => unignoreDevice(row.deviceID)}>
                              取消忽略
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {draft && tab === 'ignoredFolders' && (
            <div className="settings-panel">
              {ignoredFolderRows.length === 0 ? (
                <p className="muted">您没有忽略的文件夹。</p>
              ) : (
                <div className="settings-table-wrap">
                  <table className="settings-table">
                    <thead>
                      <tr>
                        <th>忽略时间</th>
                        <th>文件夹</th>
                        <th>设备</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {ignoredFolderRows.map((r) => (
                        <tr key={`${r.deviceId}-${r.folder.id}`}>
                          <td>{r.folder.time ? new Date(r.folder.time).toLocaleString() : '—'}</td>
                          <td>{folderLabelForId(draft.folders, r.folder.id)}</td>
                          <td title={r.deviceId}>{r.deviceLabel}</td>
                          <td>
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => unignoreFolder(r.deviceId, r.folder.id)}
                            >
                              取消忽略
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="settings-footer">
          <button type="button" className="primary" disabled={busy || !draft} onClick={() => void saveAll()}>
            <span className="btn-glyph" aria-hidden>
              ✓
            </span>
            保存
          </button>
          <button type="button" disabled={busy} onClick={() => navigate(-1)}>
            <span className="btn-glyph" aria-hidden>
              ✕
            </span>
            关闭
          </button>
        </footer>
      </div>

      {urPreviewOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setUrPreviewOpen(false)}>
          <div
            className={`modal settings-ur-modal${urPreviewModalExpanded ? ' settings-ur-modal--expanded' : ' settings-ur-modal--compact'}`}
            role="dialog"
            aria-labelledby="settings-ur-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div id="settings-ur-modal-title" className="settings-ur-modal-header">
              {t('Anonymous Usage Reporting')}
            </div>
            <div className="settings-ur-modal-body">
              <p className="settings-ur-modal-intro muted">
                {t(
                  'The encrypted usage report is sent daily. It is used to track common platforms, folder sizes, and app versions. If the reported data set is changed you will be prompted with this dialog again.'
                )}
              </p>
              <p className="settings-ur-modal-intro muted">
                {t('The aggregated statistics are publicly available at the URL below.')}{' '}
                <a href="https://data.syncthing.net/" target="_blank" rel="noreferrer">
                  https://data.syncthing.net/
                </a>
              </p>
              <div className="settings-ur-modal-controls">
                <label className="settings-ur-modal-field-label" htmlFor="settings-ur-modal-version">
                  {t('Version')}
                </label>
                <select
                  id="settings-ur-modal-version"
                  className="settings-ur-modal-version-select"
                  value={urPreviewVersion === null ? '' : String(urPreviewVersion)}
                  disabled={urPreviewBusy}
                  onChange={(e) => {
                    const raw = e.target.value
                    if (raw === '') {
                      setUrPreviewVersion(null)
                      setUrPreviewDiff(false)
                      return
                    }
                    const n = parseInt(raw, 10)
                    setUrPreviewVersion(Number.isFinite(n) ? n : null)
                  }}
                >
                  <option value="">{t('Select a version')}</option>
                  {urVersionOptions.map((n) => (
                    <option key={n} value={n}>
                      {t('Version')} {n}
                    </option>
                  ))}
                </select>
                <label className="settings-ur-modal-diff">
                  <input
                    type="checkbox"
                    checked={urPreviewDiff}
                    disabled={urPreviewBusy || urPreviewVersion == null || urPreviewVersion <= 1}
                    onChange={(e) => setUrPreviewDiff(e.target.checked)}
                  />
                  {t('Show diff with previous version')}
                </label>
              </div>
              <hr className="settings-ur-modal-sep" />
              {urPreviewVersion == null ? (
                <p className="settings-ur-modal-pick-hint muted">{t('Select a version')}</p>
              ) : urVersionOptions.length === 0 ? (
                <p className="settings-ur-modal-pick-hint muted">
                  暂无可选的匿名报告格式版本（请确认 Ark Sync 已返回 urVersionMax）。
                </p>
              ) : (
                <div className="settings-ur-pre-wrap">
                  <pre className="settings-ur-pre">
                    {urPreviewBusy ? t('Loading...') : urPreviewJson || '—'}
                  </pre>
                </div>
              )}
            </div>
            <div className="settings-ur-modal-footer">
              <button type="button" onClick={() => setUrPreviewOpen(false)}>
                <span className="btn-glyph" aria-hidden>
                  ✕
                </span>
                {t('Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {defaultsModal && (
        <div className="modal-backdrop" role="presentation" onClick={() => setDefaultsModal(null)}>
          <div className="modal settings-defaults-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{defaultsModal === 'folder' ? '文件夹默认值（JSON）' : '设备默认值（JSON）'}</h3>
            <textarea
              className="settings-defaults-textarea"
              value={defaultsJson}
              onChange={(e) => setDefaultsJson(e.target.value)}
              spellCheck={false}
            />
            <div className="row" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" onClick={() => setDefaultsModal(null)}>
                取消
              </button>
              <button type="button" className="primary" onClick={() => saveDefaultsModal()}>
                应用到当前草稿
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
