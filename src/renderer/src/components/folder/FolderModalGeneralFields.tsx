import React from 'react'
import { useTranslation } from 'react-i18next'

export default function FolderModalGeneralFields({
  label,
  group,
  folderId,
  path,
  onLabel,
  onGroup,
  onFolderId,
  onPath,
  idReadOnly,
  pathTildeHint,
  onCopyId
}: {
  label: string
  group: string
  folderId: string
  path: string
  onLabel: (v: string) => void
  onGroup: (v: string) => void
  onFolderId: (v: string) => void
  onPath: (v: string) => void
  idReadOnly: boolean
  pathTildeHint: string
  onCopyId?: () => void
}): React.ReactElement {
  const { t } = useTranslation()
  const hintPath = pathTildeHint || '/home'

  return (
    <div className="modal-tab-panel">
      <div className="field">
        <label>{t('Ark.FolderLabel')}</label>
        <input className="modal-field-input-full" value={label} onChange={(e) => onLabel(e.target.value)} />
        <p className="field-help">{t('Ark.FolderLabelHelp')}</p>
      </div>
      <div className="field">
        <label>{t('Ark.FolderGroup')}</label>
        <input className="modal-field-input-full" value={group} onChange={(e) => onGroup(e.target.value)} />
        <p className="field-help">{t('Ark.FolderGroupHelp')}</p>
      </div>
      <div className="field">
        <label>{t('Ark.FolderId')}</label>
        {idReadOnly ? (
          <div className="device-id-row">
            <input value={folderId} readOnly disabled className="device-id-input modal-field-input-full" />
            {onCopyId && (
              <div className="device-id-actions">
                <button type="button" className="icon-btn" title="Copy" onClick={() => onCopyId()}>
                  ⧉
                </button>
              </div>
            )}
          </div>
        ) : (
          <input className="modal-field-input-full" value={folderId} onChange={(e) => onFolderId(e.target.value)} />
        )}
        <p className="field-help">{t('Ark.FolderIdHelp')}</p>
      </div>
      <div className="field">
        <label>{t('Ark.FolderPath')}</label>
        <input
          className="modal-field-input-full"
          value={path}
          onChange={(e) => onPath(e.target.value)}
          placeholder="/home/me/Sync"
        />
        <p className="field-help">
          {t('Ark.FolderPathHelp', { hintPath })}
        </p>
      </div>
    </div>
  )
}
