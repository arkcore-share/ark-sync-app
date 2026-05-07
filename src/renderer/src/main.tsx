import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import I18nGate from './components/I18nGate'
import './styles/global.css'

const plat = typeof window !== 'undefined' ? window.syncWeb?.electronPlatform : undefined
if (plat) {
  document.documentElement.dataset.electronPlatform = plat
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nGate>
      <HashRouter>
        <App />
      </HashRouter>
    </I18nGate>
  </React.StrictMode>
)
