import React, { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isElectronApp } from '../electronBridge'
import { useConnection } from '../context/ConnectionContext'

const DEFAULT_BASE = 'http://127.0.0.1:8384'

export default function ConnectPage(): React.ReactElement {
  const navigate = useNavigate()
  const { setConnection, error: bootError } = useConnection()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enterSystem = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      if (!isElectronApp()) {
        throw new Error(
          '「进入系统」使用本机免 API 密钥连接，仅支持桌面客户端。请使用 Ark Sync 安装版或运行 npm run dev 打开的 Electron 窗口；浏览器模式请改用带 API 密钥的高级连接方式。'
        )
      }
      await setConnection({
        baseUrl: DEFAULT_BASE,
        apiKey: '',
        rejectUnauthorized: true,
        localSession: true
      })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [navigate, setConnection])

  return (
    <div className="connect-welcome-root">
      <div className="connect-welcome">
        <div className="connect-welcome-inner card">
          <div className="connect-welcome-grid">
            <div className="connect-welcome-visual">
              <div className="connect-welcome-art">
                <img src="/connect-welcome.png" alt="" width={400} height={400} decoding="async" />
              </div>
            </div>
            <div className="connect-welcome-copy">
              <h1 className="connect-welcome-title">Ark Sync</h1>
              <p className="connect-welcome-tagline">智能体安全与配置同步，从本机一键开始</p>
              <ul className="connect-welcome-features">
                <li>
                  <span className="connect-welcome-step" aria-hidden>
                    1
                  </span>
                  <div className="connect-welcome-feature-body">
                    <span className="connect-welcome-feature-name">Skill 安全检测</span>
                    <span className="connect-welcome-feature-desc">
                      对本地技能与相关文件做规则扫描，提示敏感信息与高风险操作，便于同步前自检与处置。
                    </span>
                  </div>
                </li>
                <li>
                  <span className="connect-welcome-step" aria-hidden>
                    2
                  </span>
                  <div className="connect-welcome-feature-body">
                    <span className="connect-welcome-feature-name">Skill · Memory · Files</span>
                    <span className="connect-welcome-feature-desc">
                      技能、记忆 / 数据库与配置文件等路径的探测与展示；在已连接实例与共享策略下，配合 Ark Sync 保持多端一致。
                    </span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
          <div className="connect-welcome-actions">
            {(bootError || error) && <div className="error-banner">{bootError || error}</div>}
            <button
              type="button"
              className="primary connect-welcome-btn"
              disabled={busy}
              onClick={() => void enterSystem()}
            >
              {busy ? '进入中…' : '进入系统'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
