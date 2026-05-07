import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useConnection } from '../context/ConnectionContext'
import type { DeviceConfiguration, FolderConfiguration, SystemConfig } from '../api/types'
import { shortDeviceId } from '../util/format'
import {
  deviceCompare,
  docsConfigOptionUrl,
  folderCompare,
  inputTypeFor,
  uncamelLabel,
  type InputFieldType
} from '../util/syncthingAdvanced'

function normalizeAdvancedConfig(raw: SystemConfig): SystemConfig {
  const c = JSON.parse(JSON.stringify(raw)) as SystemConfig
  c.devices = [...(c.devices || [])].sort(deviceCompare)
  c.folders = [...(c.folders || [])].sort(folderCompare)
  if (!c.defaults) {
    c.defaults = {}
  }
  const d = c.defaults as Record<string, unknown>
  if (!d.folder || typeof d.folder !== 'object') {
    d.folder = {}
  }
  if (!d.device || typeof d.device !== 'object') {
    d.device = {}
  }
  if (!d.ignores || typeof d.ignores !== 'object') {
    d.ignores = { lines: [] as string[] }
  }
  const ign = d.ignores as { lines?: string[] }
  if (!Array.isArray(ign.lines)) {
    ign.lines = []
  }
  return c
}

function FieldRow({
  id,
  label,
  docsUrl,
  children
}: {
  id: string
  label: React.ReactNode
  docsUrl?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="advanced-form-row">
      <label htmlFor={id} className="advanced-form-label">
        {label}
        {docsUrl ? (
          <>
            {' '}
            <a href={docsUrl} target="_blank" rel="noreferrer" className="advanced-form-help" title="文档">
              ?
            </a>
          </>
        ) : null}
      </label>
      <div className="advanced-form-control">{children}</div>
    </div>
  )
}

function renderValueInput(
  id: string,
  type: InputFieldType,
  value: unknown,
  onChange: (v: unknown) => void,
  disabled?: boolean
): React.ReactNode {
  if (type === 'skip') {
    return null
  }
  if (type === 'null') {
    return <span className="muted">null</span>
  }
  if (type === 'checkbox') {
    return (
      <label className="advanced-checkbox-label">
        <input
          id={id}
          type="checkbox"
          checked={!!value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    )
  }
  if (type === 'number') {
    return (
      <input
        id={id}
        type="number"
        value={typeof value === 'number' ? value : ''}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    )
  }
  if (type === 'list') {
    const arr = Array.isArray(value) ? value : []
    const text = arr.map(String).join(', ')
    return (
      <input
        id={id}
        type="text"
        value={text}
        disabled={disabled}
        placeholder="comma,separated"
        onChange={(e) =>
          onChange(
            e.target.value
              .split(/[,]/)
              .map((x) => x.trim())
              .filter(Boolean)
          )
        }
      />
    )
  }
  return (
    <input
      id={id}
      type="text"
      value={value != null ? String(value) : ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export default function AdvancedPage(): React.ReactElement {
  const { t } = useTranslation()
  const { client } = useConnection()
  const navigate = useNavigate()
  const [advanced, setAdvanced] = useState<SystemConfig | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!client) {
      return
    }
    setBusy(true)
    setLoadErr(null)
    try {
      const cfg = await client.getConfig()
      setAdvanced(normalizeAdvancedConfig(cfg))
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e))
      setAdvanced(null)
    } finally {
      setBusy(false)
    }
  }, [client])

  useEffect(() => {
    void load()
  }, [load])

  const saveAll = async () => {
    if (!client || !advanced) {
      return
    }
    setBusy(true)
    setSaveErr(null)
    try {
      await client.setConfig(advanced)
      alert('高级配置已保存。部分项需重启 Syncthing 后生效。')
      await load()
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const updateGuiKey = (key: string, value: unknown) => {
    setAdvanced((a) => {
      if (!a) {
        return a
      }
      const gui = { ...(a.gui as Record<string, unknown>), [key]: value }
      return { ...a, gui: gui as typeof a.gui }
    })
  }

  const updateOptionsKey = (key: string, value: unknown) => {
    setAdvanced((a) => {
      if (!a) {
        return a
      }
      return {
        ...a,
        options: { ...(a.options ?? {}), [key]: value }
      }
    })
  }

  const updateLdapKey = (key: string, value: unknown) => {
    setAdvanced((a) => {
      if (!a) {
        return a
      }
      const ldap = { ...(a.ldap as Record<string, unknown> | undefined), [key]: value }
      return { ...a, ldap: ldap as typeof a.ldap }
    })
  }

  const updateFolderAt = (index: number, key: string, value: unknown) => {
    setAdvanced((a) => {
      if (!a) {
        return a
      }
      const folders = [...a.folders]
      const row = { ...(folders[index] as unknown as Record<string, unknown>), [key]: value }
      folders[index] = row as FolderConfiguration
      return { ...a, folders }
    })
  }

  const updateDeviceAt = (index: number, key: string, value: unknown) => {
    setAdvanced((a) => {
      if (!a) {
        return a
      }
      const devices = [...a.devices]
      const row = { ...(devices[index] as unknown as Record<string, unknown>), [key]: value }
      devices[index] = row as DeviceConfiguration
      return { ...a, devices }
    })
  }

  const updateDefaultsFolderKey = (key: string, value: unknown) => {
    setAdvanced((a) => {
      if (!a) {
        return a
      }
      const defaults = { ...(a.defaults as Record<string, unknown>) }
      const folder = { ...(defaults.folder as Record<string, unknown>), [key]: value }
      defaults.folder = folder
      return { ...a, defaults }
    })
  }

  const updateDefaultsDeviceKey = (key: string, value: unknown) => {
    setAdvanced((a) => {
      if (!a) {
        return a
      }
      const defaults = { ...(a.defaults as Record<string, unknown>) }
      const device = { ...(defaults.device as Record<string, unknown>), [key]: value }
      defaults.device = device
      return { ...a, defaults }
    })
  }

  const updateDefaultsIgnoresKey = (key: string, value: unknown) => {
    setAdvanced((a) => {
      if (!a) {
        return a
      }
      const defaults = { ...(a.defaults as Record<string, unknown>) }
      const ignores = { ...(defaults.ignores as Record<string, unknown>), [key]: value }
      defaults.ignores = ignores
      return { ...a, defaults }
    })
  }

  if (!client) {
    return <p className="muted">未连接</p>
  }

  return (
    <div className="settings-page">
      <div className="settings-shell settings-shell--advanced-page">
        <header className="settings-shell-header settings-shell-header--advanced">
          <span className="settings-shell-title-glyph" aria-hidden>
            ◆
          </span>
          <h1 className="settings-shell-title">{t('Advanced Configuration')}</h1>
        </header>

        <p className="settings-shell-sub settings-advanced-warn">
          <strong>{t('Be careful!')}</strong>{' '}
          {t('Incorrect configuration may damage your folder contents and render Syncthing inoperable.')}
        </p>

        <div className="settings-advanced-body">
          {loadErr && <div className="error-banner">{loadErr}</div>}
          {saveErr && <div className="error-banner">{saveErr}</div>}

          {busy && !advanced ? (
            <p className="muted">{t('Loading...')}</p>
          ) : advanced ? (
            <div className="advanced-accordion">
              <details name="adv-root" className="advanced-panel">
                <summary>{t('GUI')}</summary>
                <div className="advanced-panel-body">
                  {Object.entries(advanced.gui as Record<string, unknown>).map(([key, value], idx) => {
                    const type = inputTypeFor(key, value)
                    if (type === 'skip') {
                      return null
                    }
                    const id = `adv-gui-${idx}`
                    return (
                      <FieldRow
                        key={key}
                        id={id}
                        label={uncamelLabel(key)}
                        docsUrl={docsConfigOptionUrl('gui', key)}
                      >
                        {renderValueInput(id, type, value, (v) => updateGuiKey(key, v), busy)}
                      </FieldRow>
                    )
                  })}
                </div>
              </details>

              <details name="adv-root" className="advanced-panel">
                <summary>{t('Options')}</summary>
                <div className="advanced-panel-body">
                  {Object.entries(advanced.options ?? {}).map(([key, value], idx) => {
                    const type = inputTypeFor(key, value)
                    if (type === 'skip') {
                      return null
                    }
                    const id = `adv-opt-${idx}`
                    return (
                      <FieldRow
                        key={key}
                        id={id}
                        label={uncamelLabel(key)}
                        docsUrl={docsConfigOptionUrl('options', key)}
                      >
                        {renderValueInput(id, type, value, (v) => updateOptionsKey(key, v), busy)}
                      </FieldRow>
                    )
                  })}
                </div>
              </details>

              <details name="adv-root" className="advanced-panel">
                <summary>{t('LDAP')}</summary>
                <div className="advanced-panel-body">
                  {Object.entries((advanced.ldap ?? {}) as Record<string, unknown>).map(([key, value], idx) => {
                    const type = inputTypeFor(key, value)
                    if (type === 'skip') {
                      return null
                    }
                    const id = `adv-ldap-${idx}`
                    return (
                      <FieldRow
                        key={key}
                        id={id}
                        label={uncamelLabel(key)}
                        docsUrl={docsConfigOptionUrl('ldap', key)}
                      >
                        {renderValueInput(id, type, value, (v) => updateLdapKey(key, v), busy)}
                      </FieldRow>
                    )
                  })}
                </div>
              </details>

              <details name="adv-root" className="advanced-panel">
                <summary>{t('Folders')}</summary>
                <div className="advanced-panel-body advanced-panel-body--nest">
                  {advanced.folders.map((folder, fi) => (
                    <details key={folder.id || fi} name="adv-folder" className="advanced-panel advanced-panel--nested">
                      <summary>
                        {folder.label?.trim()
                          ? `${t('Folder')} "${folder.label}" (${folder.id})`
                          : `${t('Folder')} "${folder.id}"`}
                      </summary>
                      <div className="advanced-panel-body">
                        {Object.entries(folder as unknown as Record<string, unknown>).map(([key, value], idx) => {
                          const type = inputTypeFor(key, value)
                          if (type === 'skip') {
                            return null
                          }
                          const id = `adv-f-${fi}-${idx}`
                          return (
                            <FieldRow
                              key={key}
                              id={id}
                              label={uncamelLabel(key)}
                              docsUrl={docsConfigOptionUrl('folder', key)}
                            >
                              {renderValueInput(id, type, value, (v) => updateFolderAt(fi, key, v), busy)}
                            </FieldRow>
                          )
                        })}
                      </div>
                    </details>
                  ))}
                </div>
              </details>

              <details name="adv-root" className="advanced-panel">
                <summary>{t('Devices')}</summary>
                <div className="advanced-panel-body advanced-panel-body--nest">
                  {advanced.devices.map((device, di) => (
                    <details key={device.deviceID || di} name="adv-device" className="advanced-panel advanced-panel--nested">
                      <summary>
                        {t('Device')} &quot;{device.name?.trim() ? device.name : shortDeviceId(device.deviceID)}
                        &quot;
                      </summary>
                      <div className="advanced-panel-body">
                        {Object.entries(device as unknown as Record<string, unknown>).map(([key, value], idx) => {
                          const type = inputTypeFor(key, value)
                          if (type === 'skip') {
                            return null
                          }
                          const id = `adv-d-${di}-${idx}`
                          return (
                            <FieldRow
                              key={key}
                              id={id}
                              label={uncamelLabel(key)}
                              docsUrl={docsConfigOptionUrl('device', key)}
                            >
                              {renderValueInput(id, type, value, (v) => updateDeviceAt(di, key, v), busy)}
                            </FieldRow>
                          )
                        })}
                      </div>
                    </details>
                  ))}
                </div>
              </details>

              <details name="adv-root" className="advanced-panel">
                <summary>{t('Defaults')}</summary>
                <div className="advanced-panel-body advanced-panel-body--nest">
                  <details name="adv-def" className="advanced-panel advanced-panel--nested">
                    <summary>{t('Default Folder')}</summary>
                    <div className="advanced-panel-body">
                      {Object.entries((advanced.defaults?.folder ?? {}) as Record<string, unknown>).map(
                        ([key, value], idx) => {
                          const type = inputTypeFor(key, value)
                          if (type === 'skip') {
                            return null
                          }
                          const id = `adv-df-${idx}`
                          return (
                            <FieldRow
                              key={key}
                              id={id}
                              label={uncamelLabel(key)}
                              docsUrl={docsConfigOptionUrl('folder', key)}
                            >
                              {renderValueInput(id, type, value, (v) => updateDefaultsFolderKey(key, v), busy)}
                            </FieldRow>
                          )
                        }
                      )}
                    </div>
                  </details>

                  <details name="adv-def" className="advanced-panel advanced-panel--nested">
                    <summary>{t('Default Device')}</summary>
                    <div className="advanced-panel-body">
                      {Object.entries((advanced.defaults?.device ?? {}) as Record<string, unknown>).map(
                        ([key, value], idx) => {
                          const type = inputTypeFor(key, value)
                          if (type === 'skip') {
                            return null
                          }
                          const id = `adv-dd-${idx}`
                          return (
                            <FieldRow
                              key={key}
                              id={id}
                              label={uncamelLabel(key)}
                              docsUrl={docsConfigOptionUrl('device', key)}
                            >
                              {renderValueInput(id, type, value, (v) => updateDefaultsDeviceKey(key, v), busy)}
                            </FieldRow>
                          )
                        }
                      )}
                    </div>
                  </details>

                  <details name="adv-def" className="advanced-panel advanced-panel--nested">
                    <summary>{t('Default Ignore Patterns')}</summary>
                    <div className="advanced-panel-body">
                      {Object.entries((advanced.defaults?.ignores ?? {}) as Record<string, unknown>).map(
                        ([key, value], idx) => {
                          if (key.startsWith('_')) {
                            return null
                          }
                          const type = inputTypeFor(key, value)
                          if (type === 'skip') {
                            return null
                          }
                          const id = `adv-di-${idx}`
                          if (key === 'lines' && Array.isArray(value)) {
                            const text = value.join('\n')
                            return (
                              <FieldRow key={key} id={id} label={uncamelLabel(key)} docsUrl={docsConfigOptionUrl('defaults.ignores', key)}>
                                <textarea
                                  id={id}
                                  rows={5}
                                  value={text}
                                  disabled={busy}
                                  className="advanced-textarea"
                                  onChange={(e) =>
                                    updateDefaultsIgnoresKey(
                                      'lines',
                                      e.target.value.split('\n')
                                    )
                                  }
                                />
                              </FieldRow>
                            )
                          }
                          return (
                            <FieldRow key={key} id={id} label={uncamelLabel(key)} docsUrl={docsConfigOptionUrl('defaults.ignores', key)}>
                              {renderValueInput(id, type, value, (v) => updateDefaultsIgnoresKey(key, v), busy)}
                            </FieldRow>
                          )
                        }
                      )}
                    </div>
                  </details>
                </div>
              </details>
            </div>
          ) : null}
        </div>

        <footer className="settings-footer">
          <button type="button" className="primary" disabled={busy || !advanced} onClick={() => void saveAll()}>
            <span className="btn-glyph" aria-hidden>
              ✓
            </span>
            {t('Save')}
          </button>
          <button type="button" disabled={busy} onClick={() => navigate(-1)}>
            <span className="btn-glyph" aria-hidden>
              ✕
            </span>
            {t('Close')}
          </button>
        </footer>
      </div>
    </div>
  )
}
