import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useConnection } from '../context/ConnectionContext'

const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '')

export default function Layout(): React.ReactElement {
  const { disconnect } = useConnection()

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">Sync Web</div>
        <NavLink to="/" end className={linkClass}>
          总览
        </NavLink>
        <NavLink to="/local" className={linkClass}>
          本机设备
        </NavLink>
        <NavLink to="/folders" className={linkClass}>
          文件夹
        </NavLink>
        <NavLink to="/devices" className={linkClass}>
          远程设备
        </NavLink>
        <NavLink to="/settings" className={linkClass}>
          设置
        </NavLink>
        <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
          <button type="button" className="danger" onClick={() => void disconnect()}>
            <span className="btn-glyph" aria-hidden>
              ⧉
            </span>
            断开连接
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
