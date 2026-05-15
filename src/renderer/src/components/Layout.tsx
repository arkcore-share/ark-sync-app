import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import logoUrl from '../assets/ark-logo.png'
import { useConnection } from '../context/ConnectionContext'
import { applySyncthingLocale } from '../i18n'
import PendingClusterNotifications from './PendingClusterNotifications'
import PersonalCenter from './PersonalCenter'
import QrModal from './QrModal'

const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '')

export default function Layout(): React.ReactElement {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { client, disconnect } = useConnection()
  const [qrFor, setQrFor] = useState<string | null>(null)

  useEffect(() => {
    const off = window.syncWeb?.onTrayCommand?.((cmd) => {
      switch (cmd.type) {
        case 'navigate':
          navigate(cmd.path)
          break
        case 'set-locale':
          void applySyncthingLocale(cmd.code, true)
          break
        case 'open-qr':
          void (async () => {
            if (!client) {
              window.alert(t('Ark.DeviceIdError'))
              return
            }
            try {
              const st = await client.systemStatus()
              const id = st.myID?.trim()
              if (!id) {
                throw new Error(t('Ark.DeviceIdError'))
              }
              setQrFor(id)
            } catch (e) {
              window.alert(e instanceof Error ? e.message : String(e))
            }
          })()
          break
        case 'disconnect':
          void disconnect()
          break
        default:
          break
      }
    })
    return off
  }, [navigate, client, disconnect, t])

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <img src={logoUrl} alt="" className="brand-logo" decoding="async" />
            <div className="brand-title">Ark Sync</div>
          </div>
        </div>
        <NavLink to="/" end className={linkClass}>
          {t('Ark.NavSummary')}
        </NavLink>
        <NavLink to="/agents" end className={linkClass}>
          {t('Ark.NavAgents')}
        </NavLink>
        <NavLink to="/agents/detection" className={linkClass}>
          {t('Ark.NavAgentsDetection')}
        </NavLink>
        <NavLink to="/local" className={linkClass}>
          {t('Ark.NavLocalDevice')}
        </NavLink>
        <NavLink to="/folders" className={linkClass}>
          {t('Folders')}
        </NavLink>
        <NavLink to="/devices" className={linkClass}>
          {t('Remote Devices')}
        </NavLink>
        <div className="sidebar-footer">
          <PersonalCenter />
        </div>
      </aside>
      <main className="main">
        <PendingClusterNotifications />
        <div className="main-outlet">
          <Outlet />
        </div>
      </main>
      {qrFor ? <QrModal deviceId={qrFor} onClose={() => setQrFor(null)} /> : null}
    </div>
  )
}
