import React, { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { THIRD_PARTY_SCAN_CATALOG } from '../../../shared/thirdPartyCatalog'
import type { ThirdPartyScanResult, ThirdPartyScanRow } from '../../../shared/thirdPartyScanTypes'
import type { SecurityRulesPaths, SecurityRulesSyncStatus } from '../../../shared/securityRulesSyncTypes'
import type { SkillsSecurityResult } from '../../../shared/skillsSecurityTypes'
import {
  getSecurityRulesPaths,
  getSecurityRulesSyncStatus,
  isElectronApp,
  onSecurityRulesSyncStatus,
  runThirdPartyInstall,
  scanSkillsSecurity,
  scanThirdPartyTools
} from '../electronBridge'
import {
  loadSkillsSecurityFromStorage,
  persistSkillsSecurityToStorage
} from '../util/skillsSecurityStorage'
import cosmicBgUrl from '../assets/summary-cosmic-bg.svg'
import hudCoreTechUrl from '../assets/summary-hud-core-tech.svg'

/** 智能体/环境扫描结果：浏览器/Electron 渲染进程 localStorage（非独立磁盘文件） */
const SCAN_CACHE_KEY = 'ark-sync-summary-third-party-scan-v1'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function loadCachedResult(): ThirdPartyScanResult | null {
  try {
    const raw = localStorage.getItem(SCAN_CACHE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as ThirdPartyScanResult
    if (!parsed?.items || !Array.isArray(parsed.items) || typeof parsed.scannedAt !== 'number') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function persistScanResult(r: ThirdPartyScanResult): void {
  try {
    localStorage.setItem(SCAN_CACHE_KEY, JSON.stringify(r))
  } catch {
    /* quota / private mode */
  }
}

function sameThirdPartyScan(a: ThirdPartyScanResult | null, b: ThirdPartyScanResult | null): boolean {
  if (a === b) {
    return true
  }
  if (a == null || b == null) {
    return false
  }
  if (a.scannedAt !== b.scannedAt || a.durationMs !== b.durationMs || a.items.length !== b.items.length) {
    return false
  }
  for (let i = 0; i < a.items.length; i += 1) {
    const x = a.items[i]
    const y = b.items[i]
    if (x.id !== y.id || x.name !== y.name || x.installed !== y.installed || x.via !== y.via) {
      return false
    }
  }
  return true
}

function sameSkillsScan(a: SkillsSecurityResult | null, b: SkillsSecurityResult | null): boolean {
  if (a === b) {
    return true
  }
  if (a == null || b == null) {
    return false
  }
  return (
    a.high === b.high &&
    a.medium === b.medium &&
    a.low === b.low &&
    a.ok === b.ok &&
    a.skillFiles === b.skillFiles &&
    a.gitleaksRegexRulesUsed === b.gitleaksRegexRulesUsed &&
    a.scannedAt === b.scannedAt &&
    a.durationMs === b.durationMs
  )
}


function formatScannedAt(ts: number): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date(ts))
  } catch {
    return new Date(ts).toLocaleString('zh-CN')
  }
}

function emptyResult(): ThirdPartyScanResult {
  return {
    items: THIRD_PARTY_SCAN_CATALOG.map((c) => ({
      id: c.id,
      name: c.name,
      installed: false
    })),
    scannedAt: Date.now(),
    durationMs: 0
  }
}

function emptySecResult(): SkillsSecurityResult {
  return {
    high: 0,
    medium: 0,
    low: 0,
    ok: 0,
    skillFiles: 0,
    skills: [],
    gitleaksRegexRulesUsed: 0,
    scannedAt: Date.now(),
    durationMs: 0
  }
}

function SummaryThirdPartyResultRow({
  row,
  installingId,
  onInstall
}: {
  row: ThirdPartyScanRow
  installingId: string | null
  onInstall: (productId: string) => void
}): React.ReactElement {
  const navigate = useNavigate()
  return (
    <div
      className="summary-results-row summary-results-row--clickable"
      role="row"
      onClick={() => navigate(`/agents?agent=${encodeURIComponent(row.id)}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate(`/agents?agent=${encodeURIComponent(row.id)}`)
        }
      }}
      tabIndex={0}
    >
      <div className="summary-results-name" role="cell">
        <span className="summary-results-product">{row.name}</span>
      </div>
      <div className="summary-results-status" role="cell">
        {row.installed ? (
          <button
            type="button"
            className="summary-install-btn summary-install-btn--ok"
            disabled
            title={row.via ?? '已安装'}
            onClick={(e) => e.stopPropagation()}
          >
            已安装
          </button>
        ) : (
          <button
            type="button"
            className="summary-install-btn summary-install-btn--danger"
            disabled={installingId !== null}
            onClick={(e) => {
              e.stopPropagation()
              onInstall(row.id)
            }}
          >
            {installingId === row.id ? '安装中…' : '一键安装'}
          </button>
        )}
      </div>
    </div>
  )
}

const RING_LEN = 2 * Math.PI * 50

type ScanVisual = 'idle' | 'env' | 'security'
type InstallDetailState = {
  open: boolean
  productName: string
  productId: string
  status: 'running' | 'success' | 'warning' | 'error'
  summary: string
  detailLog: string
}

export default function SummaryPage(): React.ReactElement {
  const navigate = useNavigate()
  const ringGradId = useId().replace(/:/g, '')
  const ringGradSecId = useId().replace(/:/g, '')
  const initial = useMemo(() => {
    const e = loadCachedResult()
    const s = loadSkillsSecurityFromStorage()
    return {
      envResult: e,
      envProgress: e ? 100 : 0,
      secResult: s
    }
  }, [])

  const [activeScan, setActiveScan] = useState<ScanVisual | null>(null)
  const [progress, setProgress] = useState(initial.envProgress)
  const [result, setResult] = useState<ThirdPartyScanResult | null>(initial.envResult)
  const [secResult, setSecResult] = useState<SkillsSecurityResult | null>(initial.secResult)
  const [browserOnly, setBrowserOnly] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [installDetail, setInstallDetail] = useState<InstallDetailState | null>(null)
  const [rulesSyncStatus, setRulesSyncStatus] = useState<SecurityRulesSyncStatus | null>(null)
  const [securityRulesPaths, setSecurityRulesPaths] = useState<SecurityRulesPaths | null>(null)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (): void => setPrefersReducedMotion(media.matches)
    onChange()
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    }
    media.addListener(onChange)
    return () => media.removeListener(onChange)
  }, [])

  useEffect(() => {
    if (!isElectronApp()) {
      return
    }
    void getSecurityRulesSyncStatus().then((s) => {
      if (s) {
        setRulesSyncStatus(s)
      }
    })
    void getSecurityRulesPaths().then((p) => {
      if (p) {
        setSecurityRulesPaths(p)
      }
    })
    const off = onSecurityRulesSyncStatus((s) => setRulesSyncStatus(s))
    return () => off?.()
  }, [])

  const isBusy = activeScan !== null
  const visual: ScanVisual = activeScan ?? 'idle'

  const runScan = useCallback(async () => {
    setActiveScan('env')
    setProgress(6)
    setBrowserOnly(!isElectronApp())

    // 较慢的进度条，便于辨认「正在扫描」；最短展示时间避免一闪而过
    const progTimer = window.setInterval(() => {
      setProgress((p) => (p >= 82 ? p : p + 3))
    }, 360)

    const minShow = delay(3200)

    try {
      const ipc = await scanThirdPartyTools()
      await minShow
      const next: ThirdPartyScanResult = ipc ?? emptyResult()
      setResult((prev) => {
        if (sameThirdPartyScan(prev, next)) {
          return prev
        }
        persistScanResult(next)
        return next
      })
      setProgress(100)
      await delay(600)
    } finally {
      window.clearInterval(progTimer)
      setActiveScan(null)
    }
  }, [])

  const refreshEnvScanOnly = useCallback(async (): Promise<ThirdPartyScanResult | null> => {
    const ipc = await scanThirdPartyTools()
    if (ipc) {
      setResult((prev) => {
        if (sameThirdPartyScan(prev, ipc)) {
          return prev
        }
        persistScanResult(ipc)
        return ipc
      })
      return ipc
    }
    return null
  }, [])

  /** 进入总览后 30 秒静默触发一次环境扫描（不阻塞 UI，避免首屏抖动） */
  useEffect(() => {
    if (!isElectronApp()) {
      return
    }
    const id = window.setTimeout(() => {
      void refreshEnvScanOnly()
    }, 30_000)
    return () => window.clearTimeout(id)
  }, [refreshEnvScanOnly])

  const handleOneClickInstall = useCallback(
    async (productId: string) => {
      if (!isElectronApp()) {
        window.alert('一键安装仅支持在 Ark Sync 桌面客户端中使用。')
        return
      }
      const productName = THIRD_PARTY_SCAN_CATALOG.find((x) => x.id === productId)?.name ?? productId
      setInstallingId(productId)
      setInstallDetail({
        open: true,
        productId,
        productName,
        status: 'running',
        summary: `正在执行 ${productName} 安装脚本，请稍候…`,
        detailLog: ''
      })
      try {
        const r = await runThirdPartyInstall(productId)
        if (r == null) {
          setInstallDetail((prev) =>
            prev == null
              ? null
              : {
                  ...prev,
                  status: 'error',
                  summary: '无法调用安装流程，请稍后重试。',
                  detailLog: ''
                }
          )
          return
        }
        if (r.ok) {
          await delay(400)
          const scanned = await refreshEnvScanOnly()
          if (scanned == null) {
            setInstallDetail((prev) =>
              prev == null
                ? null
                : {
                    ...prev,
                    status: 'warning',
                    summary: '安装脚本已执行，但无法刷新检测结果，请稍后手动执行「智能体侦测」。',
                    detailLog: r.log ? r.log.slice(-4000) : ''
                  }
            )
            return
          }
          const row = scanned.items.find((i) => i.id === productId)
          if (row?.installed) {
            setInstallDetail((prev) =>
              prev == null
                ? null
                : {
                    ...prev,
                    status: 'success',
                    summary: `安装完成：已检测到「${row.name}」（${row.via ?? '已就绪'}）。`,
                    detailLog: r.log ? r.log.slice(-4000) : ''
                  }
            )
          } else {
            setInstallDetail((prev) =>
              prev == null
                ? null
                : {
                    ...prev,
                    status: 'warning',
                    summary:
                      '安装命令已结束，但刷新后仍未检测到工具。请检查日志并确认 PATH/安装目录配置后再扫描。',
                    detailLog: r.log ? r.log.slice(-4000) : ''
                  }
            )
          }
        } else {
          setInstallDetail((prev) =>
            prev == null
              ? null
              : {
                  ...prev,
                  status: 'error',
                  summary: r.error ?? '安装失败',
                  detailLog: r.log ? r.log.slice(-4000) : ''
                }
          )
        }
      } catch (e) {
        setInstallDetail((prev) =>
          prev == null
            ? null
            : {
                ...prev,
                status: 'error',
                summary: e instanceof Error ? e.message : '安装过程出错',
                detailLog: ''
              }
        )
      } finally {
        setInstallingId(null)
      }
    },
    [refreshEnvScanOnly]
  )

  const runSecurityScan = useCallback(async () => {
    setActiveScan('security')
    setProgress(10)
    setBrowserOnly(!isElectronApp())

    const progTimer = window.setInterval(() => {
      setProgress((p) => (p >= 88 ? p : p + 4))
    }, 320)

    const minShow = delay(1200)

    try {
      const ipc = await scanSkillsSecurity()
      await minShow
      const next: SkillsSecurityResult = ipc ?? emptySecResult()
      setSecResult((prev) => {
        if (sameSkillsScan(prev, next)) {
          return prev
        }
        persistSkillsSecurityToStorage(next)
        return next
      })
      setProgress(100)
    } finally {
      window.clearInterval(progTimer)
      setActiveScan(null)
    }
  }, [])

  const rows: ThirdPartyScanRow[] = useMemo(() => {
    const raw =
      result?.items ?? THIRD_PARTY_SCAN_CATALOG.map((c) => ({ id: c.id, name: c.name, installed: false }))
    const byId = new Map(raw.map((r) => [r.id, r]))
    const merged = THIRD_PARTY_SCAN_CATALOG.map((c) => {
      const hit = byId.get(c.id)
      return hit ?? { id: c.id, name: c.name, installed: false }
    })
    return [...merged].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { sensitivity: 'base' }))
  }, [result?.items])

  const installedCount = rows.filter((r) => r.installed).length

  const installedRows = useMemo(() => rows.filter((r) => r.installed), [rows])
  const notInstalledRows = useMemo(() => rows.filter((r) => !r.installed), [rows])

  const goSkillsByRisk = useCallback(
    (sev: 'high' | 'medium' | 'low' | 'ok') => {
      navigate(`/agents/detection?skillRisk=${sev}`)
    },
    [navigate]
  )

  const cardBusyClass =
    visual === 'security'
      ? 'summary-scan-card-inner--busy-sec'
      : visual === 'env'
        ? 'summary-scan-card-inner--busy-env'
        : ''
  const liteVisual = prefersReducedMotion || visual === 'idle'
  const lightClass =
    liteVisual && visual === 'idle'
      ? 'summary-scan-light summary-scan-light--idle-lite'
      : visual === 'security'
        ? 'summary-scan-light summary-scan-light--sec-fast'
        : visual === 'env'
          ? 'summary-scan-light summary-scan-light--env-fast'
          : 'summary-scan-light summary-scan-light--matrix-slow'

  return (
    <div className="summary-page">
      <div className="summary-page-header">
        <h1 className="summary-page-title">总览</h1>
      </div>

      <div className="summary-scan-card">
        <div
          className={`summary-scan-card-inner summary-scan-card-inner--poster${cardBusyClass ? ` ${cardBusyClass}` : ''}${liteVisual ? ' summary-scan-card-inner--lite' : ''}`}
          data-scan-visual={visual}
        >
          <img className="summary-scan-poster" src={cosmicBgUrl} alt="" aria-hidden />
          {isBusy && !liteVisual ? <div className={lightClass} aria-hidden /> : null}
          <div className="summary-scan-vignette" aria-hidden />

          <div className="summary-scan-shell">
            <header className="summary-scan-toolbar">
              <div className="summary-scan-toolbar-left">
                <span
                  className={`summary-live-dot${isBusy ? ` is-busy${visual === 'security' ? ' is-sec' : ''}` : ''}`}
                  aria-hidden
                />
                <div>
                  <div className="summary-toolbar-title">
                    智能体侦测
                    {activeScan === 'env' ? (
                      <span className="summary-toolbar-sub muted">，正在拉取本机 PATH、安装目录与 npm 全局清单…</span>
                    ) : activeScan === 'security' ? (
                      <span className="summary-toolbar-sub muted">，正在同步 gitleaks 规则并扫描 SKILL.md…</span>
                    ) : !result ? (
                      <span className="summary-toolbar-sub muted">，启动时不会自动扫描，使用右侧按钮开始。</span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="summary-scan-toolbar-right">
                <button
                  type="button"
                  className="summary-rescan-btn"
                  onClick={() => void runScan()}
                  disabled={isBusy}
                >
                  {result ? '智能体侦测' : '开始智能体侦测'}
                </button>
                <button
                  type="button"
                  className="summary-secscan-btn"
                  onClick={() => void runSecurityScan()}
                  disabled={isBusy}
                >
                  SKILL扫描
                </button>
              </div>
            </header>

            <div className="summary-scan-body">
              <div className="summary-scan-gauge-col">
                <div
                  className={`summary-hud summary-hud--${visual}${isBusy ? ' summary-hud--running' : ''}`}
                >
                  <div className="summary-hud-radar" aria-hidden>
                    <div className="summary-hud-radar-disc">
                      <img
                        className={`summary-hud-core-image summary-hud-core-image--${visual}`}
                        src={hudCoreTechUrl}
                        alt=""
                      />
                    </div>
                  </div>
                  <span className="summary-hud-bracket summary-hud-bracket--tl" aria-hidden />
                  <span className="summary-hud-bracket summary-hud-bracket--tr" aria-hidden />
                  <span className="summary-hud-bracket summary-hud-bracket--bl" aria-hidden />
                  <span className="summary-hud-bracket summary-hud-bracket--br" aria-hidden />

                  <svg className="summary-hud-svg" viewBox="0 0 120 120" aria-hidden>
                    <defs>
                      <linearGradient id={ringGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#2a5580" stopOpacity="0.5" />
                        <stop offset="55%" stopColor="#1a5f6e" stopOpacity="0.38" />
                        <stop offset="100%" stopColor="#1e3a4a" stopOpacity="0.2" />
                      </linearGradient>
                      <linearGradient id={ringGradSecId} x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#8f3a45" stopOpacity="0.48" />
                        <stop offset="50%" stopColor="#5c4a6e" stopOpacity="0.34" />
                        <stop offset="100%" stopColor="#6b3545" stopOpacity="0.24" />
                      </linearGradient>
                    </defs>
                    <g transform="translate(60 60)">
                      <g
                        className={`summary-hud-orbit summary-hud-orbit--a${visual === 'security' ? ' summary-hud-orbit--sec' : ''}`}
                      >
                        <rect
                          x="-54"
                          y="-54"
                          width="108"
                          height="108"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="0.85"
                          strokeDasharray="10 7"
                          className="summary-hud-square"
                        />
                      </g>
                      <g
                        className={`summary-hud-orbit summary-hud-orbit--b${visual === 'security' ? ' summary-hud-orbit--sec' : ''}`}
                      >
                        <circle
                          r="58"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="0.6"
                          strokeDasharray="4 12"
                          className="summary-hud-dotted"
                        />
                      </g>
                    </g>
                    <g transform="rotate(-90 60 60)">
                      <circle
                        className="summary-scan-ring-track summary-hud-track"
                        cx="60"
                        cy="60"
                        r="50"
                        fill="none"
                      />
                      <circle
                        className="summary-scan-ring-progress summary-hud-progress"
                        cx="60"
                        cy="60"
                        r="50"
                        fill="none"
                        stroke={visual === 'security' ? `url(#${ringGradSecId})` : `url(#${ringGradId})`}
                        strokeDasharray={RING_LEN}
                        strokeDashoffset={RING_LEN * (1 - progress / 100)}
                      />
                    </g>
                    <g transform="translate(60 60)" className="summary-hud-ticks">
                      {Array.from({ length: liteVisual ? 8 : 12 }, (_, i) => (
                        <line
                          key={i}
                          x1="0"
                          y1="-46"
                          x2="0"
                          y2="-42"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          opacity="0.35"
                          transform={`rotate(${i * (360 / (liteVisual ? 8 : 12))})`}
                        />
                      ))}
                    </g>
                  </svg>

                  <div className="summary-hud-center">
                    {isBusy ? (
                      visual === 'security' ? (
                        <span className="summary-hud-pct summary-hud-pct--sec">
                          {Math.round(progress)}
                          <span className="summary-hud-pct-suffix">%</span>
                        </span>
                      ) : (
                        <span className="summary-hud-pct">
                          {Math.round(progress)}
                          <span className="summary-hud-pct-suffix">%</span>
                        </span>
                      )
                    ) : result && secResult ? (
                      <span className="summary-hud-ok-dual" title="环境与 Skills 均已有结果">
                        <span className="summary-hud-ok-bit">✓</span>
                      </span>
                    ) : result ? (
                      <span className="summary-hud-ok" title="环境扫描已有缓存">
                        ✓
                      </span>
                    ) : secResult ? (
                      <span className="summary-hud-shield" title="Skills 安全已有缓存">
                        ⧉
                      </span>
                    ) : (
                      <span className="summary-hud-standby" title="待机">
                        <span className="summary-hud-cursor">█</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="summary-scan-meta-col summary-scan-meta-col--split summary-scan-meta-col--wide">
                <div className="summary-meta-times-col">
                  <div className="summary-meta-block">
                    <div className="summary-meta-label muted">智能体侦测 · 上次时间</div>
                    <div className="summary-meta-time" aria-live="polite">
                      {result ? formatScannedAt(result.scannedAt) : '—'}
                    </div>
                    {result != null && result.durationMs > 0 ? (
                      <div className="summary-meta-duration muted">耗时 {result.durationMs} ms</div>
                    ) : null}
                  </div>
                  <div className="summary-meta-block summary-meta-block--sec-time">
                    <div className="summary-meta-label muted">Skills 安全 · 上次时间</div>
                    <div className="summary-meta-time" aria-live="polite">
                      {secResult ? formatScannedAt(secResult.scannedAt) : '—'}
                    </div>
                    {secResult != null && secResult.durationMs > 0 ? (
                      <div className="summary-meta-duration muted">耗时 {secResult.durationMs} ms</div>
                    ) : null}
                    <div className="summary-meta-skillscan muted">
                      {secResult != null
                        ? `已扫描${secResult.skillFiles}个SKILL`
                        : '未扫描'}
                    </div>
                  </div>
                </div>
                <div className="summary-meta-risks-col">
                  <div
                    className="summary-meta-risk-header muted"
                    title={
                      securityRulesPaths
                        ? `规则库目录：${securityRulesPaths.dir}\ngitleaks.toml：${securityRulesPaths.gitleaks}`
                        : undefined
                    }
                  >
                    <span className="summary-meta-label">Skills 安全</span>
                    {rulesSyncStatus != null &&
                    (rulesSyncStatus.isDownloading || rulesSyncStatus.isFreshToday) ? (
                      <span className="summary-meta-risk-header-rules" aria-live="polite">
                        <span className="summary-meta-risk-header-sep" aria-hidden="true">
                          ·
                        </span>
                        {rulesSyncStatus.isDownloading ? (
                          '规则库下载中...'
                        ) : (
                          <>
                            规则库
                            <span className="summary-rules-lib-em">最新</span>
                          </>
                        )}
                      </span>
                    ) : null}
                  </div>
                  <div className="summary-sec-risk-stack" role="status" aria-label="Skills 安全风险统计">
                    <button
                      type="button"
                      className="summary-sec-risk-line summary-sec-risk-line--high summary-sec-risk-line--btn"
                      disabled={secResult == null || isBusy}
                      title="打开检测详情（按高危筛选）"
                      onClick={() => goSkillsByRisk('high')}
                    >
                      <span className="summary-sec-risk-label">高危</span>
                      <span className="summary-sec-risk-num">{secResult != null ? secResult.high : '—'}</span>
                    </button>
                    <button
                      type="button"
                      className="summary-sec-risk-line summary-sec-risk-line--med summary-sec-risk-line--btn"
                      disabled={secResult == null || isBusy}
                      title="打开检测详情（按中危筛选）"
                      onClick={() => goSkillsByRisk('medium')}
                    >
                      <span className="summary-sec-risk-label">中危</span>
                      <span className="summary-sec-risk-num">{secResult != null ? secResult.medium : '—'}</span>
                    </button>
                    <button
                      type="button"
                      className="summary-sec-risk-line summary-sec-risk-line--low summary-sec-risk-line--btn"
                      disabled={secResult == null || isBusy}
                      title="打开检测详情（按低危筛选）"
                      onClick={() => goSkillsByRisk('low')}
                    >
                      <span className="summary-sec-risk-label">低危</span>
                      <span className="summary-sec-risk-num">{secResult != null ? secResult.low : '—'}</span>
                    </button>
                    <button
                      type="button"
                      className="summary-sec-risk-line summary-sec-risk-line--ok summary-sec-risk-line--btn"
                      disabled={secResult == null || isBusy}
                      title="检测详情不列出健康项；点此将提示说明"
                      onClick={() => goSkillsByRisk('ok')}
                    >
                      <span className="summary-sec-risk-label">健康</span>
                      <span className="summary-sec-risk-num">{secResult != null ? secResult.ok : '—'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {browserOnly && (
        <div className="summary-browser-hint card">
          <p className="muted" style={{ margin: 0 }}>
            当前为浏览器预览：无法访问本机 PATH 与目录。请使用 <strong>Ark Sync 桌面客户端</strong>{' '}
            打开以获取真实扫描结果。
          </p>
        </div>
      )}

      <div className="summary-results card">
        <div className="summary-results-head">
          <span className="summary-results-title">检测结果</span>
          <span className="summary-results-badge">
            {installedCount} / {rows.length}
          </span>
        </div>
        <div className="summary-results-table" role="table">
          <div className="summary-results-row summary-results-row--head" role="row">
            <div role="columnheader" className="summary-results-th-product">
              产品
            </div>
            <div role="columnheader" className="summary-results-th-status">
              状态
            </div>
          </div>
          {installedRows.map((row) => (
            <SummaryThirdPartyResultRow
              key={row.id}
              row={row}
              installingId={installingId}
              onInstall={(id) => void handleOneClickInstall(id)}
            />
          ))}
          {notInstalledRows.length > 0 ? (
            <details className="summary-results-uninstalled-details">
              <summary className="summary-results-uninstalled-summary">
                <span className="summary-results-uninstalled-title">未安装</span>
                <span className="summary-results-uninstalled-count muted">{notInstalledRows.length} 项</span>
              </summary>
              <div className="summary-results-uninstalled-body">
                {notInstalledRows.map((row) => (
                  <SummaryThirdPartyResultRow
                    key={row.id}
                    row={row}
                    installingId={installingId}
                    onInstall={(id) => void handleOneClickInstall(id)}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </div>

      {installDetail?.open ? (
        <div className="summary-install-overlay" role="dialog" aria-modal="true" aria-label="安装详情">
          <div className="summary-install-console">
            <div className="summary-install-console-head">
              <div className="summary-install-console-title">
                <span>安装详情</span>
                <span className={`summary-install-state summary-install-state--${installDetail.status}`}>
                  {installDetail.status === 'running'
                    ? '进行中'
                    : installDetail.status === 'success'
                      ? '成功'
                      : installDetail.status === 'warning'
                        ? '需确认'
                        : '失败'}
                </span>
              </div>
              <button
                type="button"
                className="summary-install-close-btn"
                onClick={() => setInstallDetail((prev) => (prev ? { ...prev, open: false } : null))}
                disabled={installDetail.status === 'running'}
              >
                关闭
              </button>
            </div>
            <div className="summary-install-console-meta">
              <span>{installDetail.productName}</span>
              <span className="muted">ID: {installDetail.productId}</span>
            </div>
            <p className="summary-install-console-summary">{installDetail.summary}</p>
            <pre className="summary-install-console-log">
              {installDetail.detailLog || (installDetail.status === 'running' ? '等待安装脚本输出…' : '无日志输出')}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  )
}
