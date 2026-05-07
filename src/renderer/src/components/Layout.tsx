import React from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router-dom'
import logoUrl from '../assets/ark-logo.png'
import PendingClusterNotifications from './PendingClusterNotifications'
import PersonalCenter from './PersonalCenter'

const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '')

export default function Layout(): React.ReactElement {
  const { t } = useTranslation()
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
    </div>
  )
}
