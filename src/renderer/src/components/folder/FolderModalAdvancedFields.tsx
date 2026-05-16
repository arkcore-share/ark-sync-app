import React from 'react'
import { useTranslation } from 'react-i18next'
import type { FolderConfiguration } from '../../api/types'
import { folderTypeLabel, pullOrderLabel } from '../../util/syncthingUi'
import { MIN_DISK_UNITS, PULL_ORDERS, type MinDiskUnit } from './folderModalConstants'

export default function FolderModalAdvancedFields({
  fsWatcherEnabled,
  onFsWatcher,
  rescanIntervalS,
  onRescan,
  folderType,
  onFolderType,
  order,
  onOrder,
  minDiskNum,
  minDiskUnit,
  onMinDiskNum,
  onMinDiskUnit,
  syncOwnership,
  onSyncOwnership,
  sendOwnership,
  onSendOwnership,
  ignorePerms,
  onIgnorePerms,
  syncXattrs,
  onSyncXattrs,
  sendXattrs,
  onSendXattrs,
  blockIndexing,
  onBlockIndexing
}: {
  fsWatcherEnabled: boolean
  onFsWatcher: (v: boolean) => void
  rescanIntervalS: number
  onRescan: (n: number) => void
  folderType: FolderConfiguration['type']
  onFolderType: (t: FolderConfiguration['type']) => void
  order: string
  onOrder: (s: string) => void
  minDiskNum: string
  minDiskUnit: MinDiskUnit
  onMinDiskNum: (s: string) => void
  onMinDiskUnit: (u: MinDiskUnit) => void
  syncOwnership: boolean
  onSyncOwnership: (v: boolean) => void
  sendOwnership: boolean
  onSendOwnership: (v: boolean) => void
  ignorePerms: boolean
  onIgnorePerms: (v: boolean) => void
  syncXattrs: boolean
  onSyncXattrs: (v: boolean) => void
  sendXattrs: boolean
  onSendXattrs: (v: boolean) => void
  blockIndexing: boolean
  onBlockIndexing: (v: boolean) => void
}): React.ReactElement {
  const { t } = useTranslation()
  return (
    <div className="modal-tab-panel folder-advanced-grid">
      <div className="folder-advanced-col">
        <div className="field checkbox">
          <label>{t('Ark.FolderScanning')}</label>
          <label>
            <input type="checkbox" checked={fsWatcherEnabled} onChange={(e) => onFsWatcher(e.target.checked)} />
            {t('Ark.FoldersFileWatch')}
          </label>
          <p className="field-help">{t('Ark.FoldersWatcherTip')}</p>
        </div>
        <div className="field">
          <label>{t('Ark.FolderType')}</label>
          <select
            className="modal-field-select-full modal-field-input-full"
            value={folderType}
            onChange={(e) => onFolderType(e.target.value as FolderConfiguration['type'])}
          >
            <option value="sendreceive">{t('Ark.FolderTypeSendReceive')}</option>
            <option value="sendonly">{t('Ark.FolderTypeSendOnly')}</option>
            <option value="receiveonly">{t('Ark.FolderTypeReceiveOnly')}</option>
            <option value="receiveencrypted">{t('Ark.FolderTypeReceiveEncrypted')}</option>
          </select>
          <p className="field-help">{t('Ark.FolderTypeEncryptOnly')}</p>
        </div>
        <div className="field">
          <label>{t('Ark.FolderMinDiskSpace')}</label>
          <div className="min-disk-row">
            <input
              type="text"
              inputMode="decimal"
              className="modal-field-input-full"
              value={minDiskNum}
              onChange={(e) => onMinDiskNum(e.target.value)}
            />
            <select value={minDiskUnit} onChange={(e) => onMinDiskUnit(e.target.value as MinDiskUnit)}>
              {MIN_DISK_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <p className="field-help">{t('Ark.FolderPauseSync')}</p>
        </div>
        <div className="field">
          <label>{t('Ark.FolderOwnership')}</label>
          <div className="field checkbox">
            <label>
              <input type="checkbox" checked={syncOwnership} onChange={(e) => onSyncOwnership(e.target.checked)} />
              {t('Ark.FolderOwnershipSync')}
            </label>
            <p className="field-help">{t('Ark.FolderOwnershipSyncDesc')}</p>
          </div>
          <div className="field checkbox">
            <label>
              <input type="checkbox" checked={sendOwnership} onChange={(e) => onSendOwnership(e.target.checked)} />
              {t('Ark.FolderOwnershipSend')}
            </label>
            <p className="field-help">{t('Ark.FolderOwnershipSendDesc')}</p>
          </div>
        </div>
        <div className="field checkbox">
          <label>
            <input type="checkbox" checked={blockIndexing} onChange={(e) => onBlockIndexing(e.target.checked)} />
            {t('Ark.FoldersBlockIndex')}
          </label>
          <p className="field-help">{t('Ark.FoldersBlockIndexDesc')}</p>
        </div>
      </div>
      <div className="folder-advanced-col">
        <div className="field">
          <label>{t('Ark.FolderRescanInterval')}</label>
          <input
            type="number"
            min={0}
            className="modal-field-input-full"
            value={rescanIntervalS}
            onChange={(e) => onRescan(parseInt(e.target.value, 10) || 0)}
          />
        </div>
        <div className="field">
          <label>{t('Ark.FolderPullOrder')}</label>
          <select className="modal-field-select-full modal-field-input-full" value={order} onChange={(e) => onOrder(e.target.value)}>
            {PULL_ORDERS.map((o) => (
              <option key={o} value={o}>
                {pullOrderLabel(o, t)}
              </option>
            ))}
          </select>
        </div>
        <div className="field checkbox">
          <label>
            <input type="checkbox" checked={ignorePerms} onChange={(e) => onIgnorePerms(e.target.checked)} />
            {t('Ark.FolderIgnorePerms')}
          </label>
          <p className="field-help">{t('Ark.FolderIgnorePermsDesc')}</p>
        </div>
        <div className="field">
          <label>{t('Ark.FolderExtendedAttributes')}</label>
          <div className="field checkbox">
            <label>
              <input type="checkbox" checked={syncXattrs} onChange={(e) => onSyncXattrs(e.target.checked)} />
              {t('Ark.FolderXattrSync')}
            </label>
            <p className="field-help">{t('Ark.FolderXattrSyncDesc')}</p>
          </div>
          <div className="field checkbox">
            <label>
              <input type="checkbox" checked={sendXattrs} onChange={(e) => onSendXattrs(e.target.checked)} />
              {t('Ark.FolderXattrSend')}
            </label>
            <p className="field-help">{t('Ark.FolderXattrSendDesc')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
