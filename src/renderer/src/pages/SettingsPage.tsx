import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SyncthingClient } from '../api/client'
import { useConnection } from '../context/ConnectionContext'
import { usePoll } from '../hooks/usePoll'
import type {
  DeviceConfiguration,
  FolderConfiguration,
  GuiConfiguration,
  LdapConfiguration,
  ObservedFolder,
  ObservedRemoteDevice,
  SystemConfig,
  SystemStatus
} from '../api/types'
import { sameDeviceId, shortDeviceId } from '../util/format'

const DOCS_BASE = 'https://docs.syncthing.net/'
const GUI_THEMES = ['default', 'dark', 'black', 'light']

type SettingsTab = 'general' | 'gui' | 'connections' | 'ignoredDevices' | 'ignoredFolders'

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

export default function SettingsPage(): React.ReactElement {
  const { client, connection } = useConnection()
  const navigate = useNavigate()
  const [tab, setTab] = useState<SettingsTab>('general')
  const [draft, setDraft] = useState<SystemConfig | null>(null)
  const [myId, setMyId] = useState('')
  const [sys, setSys] = useState<SystemStatus | null>(null)
  const [ver, setVer] = useState('')
  const [listenStr, setListenStr] = useState('')
  const [globalAnnStr, setGlobalAnnStr] = useState('')
  const [deviceName, setDeviceName] = useState('')
  const [minDiskVal, setMinDiskVal] = useState(1)
  const [minDiskUnit, setMinDiskUnit] = useState('%')
  const [urStr, setUrStr] = useState('0')
  const [upgrades, setUpgrades] = useState<'none' | 'stable' | 'candidate'>('stable')
  const [guiPasswordInput, setGuiPasswordInput] = useState('')
  const savedGuiPasswordRef = useRef('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [urPreviewOpen, setUrPreviewOpen] = useState(false)
  const [urPreviewJson, setUrPreviewJson] = useState('')
  const [urPreviewBusy, setUrPreviewBusy] = useState(false)
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
        client.systemVersion().catch(() => ({ version: '' }))
      ])
      setMyId(st.myID.trim())
      setSys(st)
      setVer(version.version || '')
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

      savedGuiPasswordRef.current = (cfg.gui?.password as string | undefined) ?? ''
      setGuiPasswordInput('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setDraft(null)
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

  const isCandidate = !!sys?.isCandidate
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
        isCandidate: !!sys?.isCandidate
      })

      const gui: GuiConfiguration = { ...(out.gui ?? {}) }
      if (!guiPasswordInput.trim() && savedGuiPasswordRef.current) {
        gui.password = savedGuiPasswordRef.current
      } else {
        gui.password = guiPasswordInput
      }
      out.gui = gui

      await client.setConfig(out)
      await load()
      alert('设置已保存。部分项需重启 Syncthing 后生效。')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const loadUrPreview = async () => {
    if (!client) {
      return
    }
    setUrPreviewBusy(true)
    try {
      const data = await client.getUsageReportPreview()
      setUrPreviewJson(JSON.stringify(data, null, 2))
      setUrPreviewOpen(true)
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setUrPreviewBusy(false)
    }
  }

  const shutdown = async () => {
    if (!client || !confirm('确定关闭 Syncthing 进程？桌面客户端仍可重新连接。')) {
      return
    }
    try {
      await client.shutdown()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

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

        <p className="settings-shell-sub muted">
          实例 <code>{connection?.baseUrl}</code>
          {ver ? (
            <>
              {' '}
              · Syncthing <code>{ver}</code>
            </>
          ) : null}
        </p>

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
                <div className="settings-field">
                  <label>
                    匿名使用报告 (
                    <button type="button" className="link-btn" disabled={urPreviewBusy} onClick={() => void loadUrPreview()}>
                      预览
                    </button>
                    )
                  </label>
                  {!isCandidate && upgrades !== 'candidate' ? (
                    <select value={urStr} onChange={(e) => setUrStr(e.target.value)}>
                      {urVersionOptions.map((n) => (
                        <option key={n} value={String(n)}>
                          版本 {n}
                        </option>
                      ))}
                      <option value="0">未决定（将提示）</option>
                      <option value="-1">禁用</option>
                    </select>
                  ) : (
                    <p className="field-help">发布候选版始终启用使用报告。</p>
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
                    placeholder={savedGuiPasswordRef.current ? '留空则保留当前密码' : ''}
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
              <div className="settings-field">
                <label>GUI 主题</label>
                <select value={draft.gui?.theme ?? 'default'} onChange={(e) => updateGui({ theme: e.target.value })}>
                  {GUI_THEMES.map((t) => (
                    <option key={t} value={t}>
                      {t === 'default' ? '默认' : t}
                    </option>
                  ))}
                </select>
              </div>
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
              <div className="settings-two-col">
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

        <details className="settings-extra">
          <summary>LDAP、高级选项 JSON、危险操作</summary>
          <div className="settings-extra-body">
            <p className="muted small">
              API 密钥或本应用连接凭据仍保存在 Electron 用户数据中，不会随上述配置自动写入 Syncthing 配置文件以外的逻辑。
            </p>
            {client && <LdapSection client={client} />}
            {client && <AdvancedOptionsSection client={client} />}
            <div className="settings-field">
              <button type="button" className="danger" onClick={() => void shutdown()}>
                <span className="btn-glyph" aria-hidden>
                  ⏻
                </span>
                关闭 Syncthing
              </button>
            </div>
          </div>
        </details>
      </div>

      {urPreviewOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setUrPreviewOpen(false)}>
          <div className="modal settings-ur-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>匿名使用报告（预览）</h3>
            <pre className="settings-ur-pre">{urPreviewJson || '—'}</pre>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setUrPreviewOpen(false)}>
                关闭
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

function AdvancedOptionsSection({ client }: { client: SyncthingClient }): React.ReactElement {
  const [jsonText, setJsonText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setBusy(true)
    setErr(null)
    try {
      const o = await client.getConfigOptions()
      setJsonText(JSON.stringify(o, null, 2))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setErr(null)
    try {
      const partial = JSON.parse(jsonText) as Record<string, unknown>
      await client.patchConfigOptions(partial)
      alert('高级选项已保存（部分项需重启 Syncthing 生效）')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <h2>高级选项（/rest/config/options）</h2>
      <p className="muted">直接 PATCH 选项子集，与完整「保存」独立。</p>
      {err && <div className="error-banner">{err}</div>}
      <div className="row" style={{ marginBottom: '0.5rem' }}>
        <button type="button" disabled={busy} onClick={() => void load()}>
          加载当前选项
        </button>
        <button type="button" disabled={busy || !jsonText} onClick={() => void save()}>
          PATCH 保存
        </button>
      </div>
      <textarea
        rows={10}
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8rem' }}
        placeholder="点击「加载当前选项」…"
      />
    </div>
  )
}

const LDAP_TRANSPORTS = [
  { n: '明文 (389)', v: 0 },
  { n: 'LDAPS', v: 2 },
  { n: 'StartTLS', v: 3 }
]

function LdapSection({ client }: { client: SyncthingClient }): React.ReactElement {
  const [ldap, setLdap] = useState<LdapConfiguration>({})
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setBusy(true)
    setErr(null)
    try {
      const c = await client.getLdapConfig()
      setLdap(c || {})
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setErr(null)
    try {
      await client.putLdapConfig(ldap)
      alert('LDAP 配置已保存')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <h2>LDAP</h2>
      {err && <div className="error-banner">{err}</div>}
      <div className="row" style={{ marginBottom: '0.75rem' }}>
        <button type="button" disabled={busy} onClick={() => void load()}>
          加载
        </button>
        <button type="button" disabled={busy} onClick={() => void save()}>
          保存
        </button>
      </div>
      <div className="field">
        <label>服务器地址</label>
        <input
          value={ldap.address ?? ''}
          onChange={(e) => setLdap((x) => ({ ...x, address: e.target.value }))}
          placeholder="ldap://server:389"
        />
      </div>
      <div className="field">
        <label>传输</label>
        <select
          value={ldap.transport ?? 0}
          onChange={(e) => setLdap((x) => ({ ...x, transport: Number(e.target.value) }))}
        >
          {LDAP_TRANSPORTS.map((t) => (
            <option key={t.v} value={t.v}>
              {t.n}
            </option>
          ))}
        </select>
      </div>
      <div className="field checkbox">
        <label>
          <input
            type="checkbox"
            checked={!!ldap.insecureSkipVerify}
            onChange={(e) => setLdap((x) => ({ ...x, insecureSkipVerify: e.target.checked }))}
          />
          跳过 TLS 证书校验（仅测试环境）
        </label>
      </div>
      <div className="field">
        <label>Bind DN</label>
        <input value={ldap.bindDN ?? ''} onChange={(e) => setLdap((x) => ({ ...x, bindDN: e.target.value }))} />
      </div>
      <div className="field">
        <label>Search Base DN</label>
        <input value={ldap.searchBaseDN ?? ''} onChange={(e) => setLdap((x) => ({ ...x, searchBaseDN: e.target.value }))} />
      </div>
      <div className="field">
        <label>Search Filter</label>
        <input
          value={ldap.searchFilter ?? ''}
          onChange={(e) => setLdap((x) => ({ ...x, searchFilter: e.target.value }))}
          placeholder="(sAMAccountName=%s)"
        />
      </div>
    </div>
  )
}
