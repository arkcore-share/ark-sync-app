import React from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router-dom'

const subNavClass = ({ isActive }: { isActive: boolean }): string =>
  `agents-subnav-link${isActive ? ' is-active' : ''}`

export default function AgentsLayout(): React.ReactElement {
  const { t } = useTranslation()
  return (
    <div className="agents-layout">
      <nav className="agents-subnav" aria-label={t('Ark.NavAgents')}>
        <NavLink to="/agents" end className={subNavClass}>
          {t('Ark.AgentsSubnavList')}
        </NavLink>
        <NavLink to="/agents/detection" className={subNavClass}>
          {t('Ark.NavAgentsDetection')}
        </NavLink>
      </nav>
      <Outlet />
    </div>
  )
}
