import React from 'react'
import type { FolderModalTabId } from './folderModalConstants'
import { FOLDER_MODAL_TABS } from './folderModalConstants'

export default function FolderModalTabStrip({
  tab,
  onTab
}: {
  tab: FolderModalTabId
  onTab: (t: FolderModalTabId) => void
}): React.ReactElement {
  return (
    <div className="modal-tabs">
      {FOLDER_MODAL_TABS.map(({ id, label, glyph }) => (
        <button
          type="button"
          key={id}
          className={`modal-tab ${tab === id ? 'modal-tab-active' : ''}`}
          onClick={() => onTab(id)}
        >
          <span className="modal-tab-glyph" aria-hidden>
            {glyph}
          </span>
          {label}
        </button>
      ))}
    </div>
  )
}
