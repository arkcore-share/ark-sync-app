import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ConnectionProvider, useConnection } from './context/ConnectionContext'
import Layout from './components/Layout'
import ConnectPage from './pages/ConnectPage'
import DashboardPage from './pages/DashboardPage'
import DevicesPage from './pages/DevicesPage'
import FoldersPage from './pages/FoldersPage'
import SettingsPage from './pages/SettingsPage'
import SummaryPage from './pages/SummaryPage'

function Shell(): React.ReactElement {
  const { connection, ready } = useConnection()

  if (!ready) {
    return (
      <div className="main" style={{ padding: '2rem' }}>
        <p className="muted">正在加载…</p>
      </div>
    )
  }

  if (!connection) {
    return <ConnectPage />
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<SummaryPage />} />
        <Route path="local" element={<DashboardPage />} />
        <Route path="folders" element={<FoldersPage />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App(): React.ReactElement {
  return (
    <ConnectionProvider>
      <Shell />
    </ConnectionProvider>
  )
}
