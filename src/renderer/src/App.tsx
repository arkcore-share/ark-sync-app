import React from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ConnectionProvider, useConnection } from './context/ConnectionContext'
import Layout from './components/Layout'
import ConnectPage from './pages/ConnectPage'
import DashboardPage from './pages/DashboardPage'
import DevicesPage from './pages/DevicesPage'
import FoldersPage from './pages/FoldersPage'
import AboutPage from './pages/AboutPage'
import AdvancedPage from './pages/AdvancedPage'
import LogsPage from './pages/LogsPage'
import SettingsPage from './pages/SettingsPage'
import SummaryPage from './pages/SummaryPage'
import WinTitleBar from './components/WinTitleBar'

function ElectronChromeShell({ children }: { children: React.ReactNode }): React.ReactElement {
  if (typeof window !== 'undefined' && window.syncWeb?.electronPlatform === 'win32') {
    return (
      <div className="electron-chrome">
        <WinTitleBar />
        <div className="electron-chrome-body">{children}</div>
      </div>
    )
  }
  return <>{children}</>
}

function Shell(): React.ReactElement {
  const { t } = useTranslation()
  const { connection, ready } = useConnection()

  if (!ready) {
    return (
      <div className="main" style={{ padding: '2rem' }}>
        <p className="muted">{t('Ark.Loading')}</p>
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
        <Route path="advanced" element={<AdvancedPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="about" element={<AboutPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App(): React.ReactElement {
  return (
    <ConnectionProvider>
      <ElectronChromeShell>
        <Shell />
      </ElectronChromeShell>
    </ConnectionProvider>
  )
}
