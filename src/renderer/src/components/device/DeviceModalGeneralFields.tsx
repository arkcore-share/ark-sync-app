import React from 'react'
import { useTranslation } from 'react-i18next'

export default function DeviceModalGeneralFields({
  mode,
  deviceIdText,
  onDeviceIdChange,
  onCopyId,
  onShowQr,
  name,
  group,
  onName,
  onGroup,
  idHelp,
  nameHelp,
  groupHelp
}: {
  mode: 'add' | 'edit'
  deviceIdText: string
  onDeviceIdChange?: (v: string) => void
  onCopyId: () => void
  onShowQr: () => void
  name: string
  group: string
  onName: (v: string) => void
  onGroup: (v: string) => void
  idHelp: string
  nameHelp: string
  groupHelp: string
}): React.ReactElement {
  const { t } = useTranslation()
  const isEdit = mode === 'edit'

  return (
    <div className="modal-tab-panel">
      <div className="field">
        <label>{t('Ark.DeviceId')}</label>
        <div className="device-id-row">
          {isEdit ? (
            <input
              value={deviceIdText}
              readOnly
              disabled
              className="device-id-input modal-field-input-full"
            />
          ) : (
            <textarea
              className="device-id-input modal-field-input-full device-id-textarea-add"
              rows={3}
              value={deviceIdText}
              onChange={(e) => onDeviceIdChange?.(e.target.value)}
              placeholder="XXXXXXX-…"
            />
          )}
          <div className="device-id-actions">
            <button type="button" className="icon-btn" title="Copy" onClick={() => onCopyId()}>
              ⧉
            </button>
            <button type="button" className="icon-btn" title="Email (placeholder)" disabled>
              ✉
            </button>
            <button type="button" className="icon-btn" title="Message (placeholder)" disabled>
              💬
            </button>
            <button type="button" className="icon-btn" title={t('Ark.DevicesShowQr')} onClick={() => onShowQr()}>
              ▣
            </button>
          </div>
        </div>
        {idHelp.trim() ? <p className="field-help">{idHelp}</p> : null}
      </div>
      <div className="field">
        <label>{t('Ark.DeviceName')}</label>
        <input className="modal-field-input-full" value={name} onChange={(e) => onName(e.target.value)} />
        <p className="field-help">{nameHelp}</p>
      </div>
      <div className="field">
        <label>{t('Ark.DeviceGroup')}</label>
        <input className="modal-field-input-full" value={group} onChange={(e) => onGroup(e.target.value)} />
        <p className="field-help">{groupHelp}</p>
      </div>
    </div>
  )
}
