import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import type { AgentArtifactsDetail, AgentArtifactEntry } from '../../../shared/agentArtifactsTypes'
import type { SkillSecurityItem, SkillsSecuritySeverity } from '../../../shared/skillsSecurityTypes'
import { THIRD_PARTY_SCAN_CATALOG } from '../../../shared/thirdPartyCatalog'
import { isElectronApp, listAgentArtifacts, openPath, showItemInFolder } from '../electronBridge'
import { loadSkillsSecurityFromStorage, mergeSeverity, normSkillPath } from '../util/skillsSecurityStorage'

function placeholderAgentRows(): AgentArtifactsDetail[] {
  return THIRD_PARTY_SCAN_CATALOG.map((c) => ({
    id: c.id,
    name: c.name,
    installed: false,
    dataRoot: null,
    dataRootPresent: false,
    skills: [],
    memory: [],
    files: []
  }))
}

function severityForSkillEntry(entry: AgentArtifactEntry, skillRows: SkillSecurityItem[]): SkillsSecuritySeverity | null {
  if (skillRows.length === 0) {
    return null
  }
  const ep = normSkillPath(entry.path)
  if (entry.kind === 'file' && ep.endsWith('/skill.md')) {
    const hit = skillRows.find((r) => normSkillPath(r.path) === ep)
    return hit?.severity ?? null
  }
  let best: SkillsSecuritySeverity | null = null
  for (const r of skillRows) {
    const sp = normSkillPath(r.path)
    if (!(sp.startsWith(ep + '/') || sp === ep)) {
      continue
    }
    best = best == null ? r.severity : mergeSeverity(best, r.severity)
  }
  return best
}

function skillSecBadgeClass(sev: SkillsSecuritySeverity | null): string {
  if (sev == null) {
    return 'agents-skill-sec-badge agents-skill-sec-badge--unknown'
  }
  return `agents-skill-sec-badge agents-skill-sec-badge--${sev}`
}

function skillSecBadgeText(
  sev: SkillsSecuritySeverity | null,
  t: TFunction,
  hasScanData: boolean
): string {
  if (sev == null) {
    return hasScanData ? t('Ark.SkillSecNoSkillMd') : t('Ark.SkillSecRunOverviewScan')
  }
  if (sev === 'high') {
    return t('Ark.SkillSecHigh')
  }
  if (sev === 'medium') {
    return t('Ark.SkillSecMedium')
  }
  if (sev === 'low') {
    return t('Ark.SkillSecLow')
  }
  return t('Ark.SkillSecOk')
}

const ArtifactList = memo(function ArtifactList({
  items,
  emptyLabel,
  onOpen,
  showSkillSecLabels,
  skillRows,
  firstItemScrollRef,
  capVisibleRows
}: {
  items: AgentArtifactEntry[]
  emptyLabel: string
  onOpen: (path: string, isDir: boolean) => void
  /** Cursor / Hermes 等参与 SKILL.md 安全扫描的产品 */
  showSkillSecLabels: boolean
  skillRows: SkillSecurityItem[]
  firstItemScrollRef?: React.RefObject<HTMLLIElement | null>
  /** 超过此行数时在容器内滚动（用于 Skill 列表） */
  capVisibleRows?: number
}): React.ReactElement {
  const { t } = useTranslation()
  const hasScanData = skillRows.length > 0
  if (items.length === 0) {
    return <p className="agents-artifact-empty muted">{emptyLabel}</p>
  }
  const listClass =
    capVisibleRows != null && capVisibleRows > 0
      ? `agents-artifact-list agents-artifact-list--cap-rows`
      : 'agents-artifact-list'
  const listStyle =
    capVisibleRows != null && capVisibleRows > 0
      ? ({ ['--agents-artifact-cap-rows' as string]: String(capVisibleRows) } as React.CSSProperties)
      : undefined
  return (
    <ul className={listClass} style={listStyle}>
      {items.map((e, idx) => {
        const sev = showSkillSecLabels ? severityForSkillEntry(e, skillRows) : null
        return (
          <li key={e.path} ref={idx === 0 && firstItemScrollRef ? firstItemScrollRef : undefined}>
            <button
              type="button"
              className="agents-path-btn"
              title={e.path}
              onClick={() => onOpen(e.path, e.kind === 'dir')}
            >
              {showSkillSecLabels ? (
                <span className={skillSecBadgeClass(sev)}>{skillSecBadgeText(sev, t, hasScanData)}</span>
              ) : null}
              <span className={`agents-kind agents-kind--${e.kind}`}>{e.kind === 'dir' ? 'DIR' : 'FILE'}</span>
              <span className="agents-path-text">{e.label ?? e.path}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
})

function parentDir(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i > 0 ? p.slice(0, i) : p
}

function normPathKey(p: string): string {
  return p.replace(/[/\\]+$/, '').replace(/\\/g, '/').toLowerCase()
}

function isUnder(parent: string, child: string): boolean {
  const a = normPathKey(parent)
  const b = normPathKey(child)
  return b === a || b.startsWith(a + '/')
}

function mergeDirectSiblingsToParent(roots: string[]): string[] {
  const byParent = new Map<string, number>()
  for (const r of roots) {
    const p = parentDir(r)
    if (normPathKey(p) !== normPathKey(r)) {
      byParent.set(p, (byParent.get(p) ?? 0) + 1)
    }
  }
  const collapseParent = new Set<string>()
  for (const [par, n] of byParent) {
    if (n >= 2) {
      collapseParent.add(par)
    }
  }
  if (collapseParent.size === 0) {
    return roots
  }
  const next: string[] = []
  const addedParent = new Set<string>()
  for (const r of roots) {
    const p = parentDir(r)
    if (collapseParent.has(p)) {
      const pk = normPathKey(p)
      if (!addedParent.has(pk)) {
        next.push(p)
        addedParent.add(pk)
      }
    } else {
      next.push(r)
    }
  }
  return next
}

function syncFolderRoots(entries: AgentArtifactEntry[]): string[] {
  if (entries.length === 0) {
    return []
  }
  const raw = [...new Set(entries.map((e) => (e.kind === 'dir' ? e.path : parentDir(e.path))))]
  raw.sort((a, b) => {
    const la = normPathKey(a).length
    const lb = normPathKey(b).length
    if (la !== lb) {
      return la - lb
    }
    return a.localeCompare(b, undefined, { sensitivity: 'base' })
  })
  const out: string[] = []
  for (const f of raw) {
    if (out.some((ex) => isUnder(ex, f))) {
      continue
    }
    const kept = out.filter((ex) => !isUnder(f, ex))
    kept.push(f)
    out.length = 0
    out.push(...kept)
  }
  const merged = mergeDirectSiblingsToParent(out)
  return merged.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

/** 由当前分类条目推导的同步根路径列表（无标题，仅路径 +「打开目录」） */
const AgentSyncRoots = memo(function AgentSyncRoots({
  entries,
  onOpenFolder,
  capVisibleRows
}: {
  entries: AgentArtifactEntry[]
  onOpenFolder: (path: string | null) => void
  capVisibleRows?: number
}): React.ReactElement | null {
  const { t } = useTranslation()
  const roots = useMemo(() => syncFolderRoots(entries), [entries])
  if (roots.length === 0) {
    return null
  }
  const linesWrapClass =
    capVisibleRows != null && capVisibleRows > 0
      ? 'agents-sync-roots-lines agents-sync-roots-lines--cap-rows'
      : 'agents-sync-roots-lines'
  const linesWrapStyle: React.CSSProperties | undefined =
    capVisibleRows != null && capVisibleRows > 0
      ? { ['--agents-sync-cap-rows' as string]: String(capVisibleRows) }
      : undefined
  return (
    <div className="agents-sync-roots">
      <div className={linesWrapClass} style={linesWrapStyle}>
        {roots.map((dir) => (
          <div key={dir} className="agents-sync-root-line">
            <code className="agents-root-path">{dir}</code>
            <button type="button" className="agents-linkish" onClick={() => void onOpenFolder(dir)}>
              {t('Ark.AgentsOpenFolder')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
})

/** 首次展开前不挂载子树，避免主抽屉一打开就渲染大量路径按钮 */
function LazyAgentsSubdrawer({
  summary,
  children,
  forceOpenBody = false
}: {
  summary: React.ReactNode
  children: React.ReactNode
  forceOpenBody?: boolean
}): React.ReactElement {
  const [open, setOpen] = useState(forceOpenBody)
  const [mounted, setMounted] = useState(forceOpenBody)

  useEffect(() => {
    if (forceOpenBody) {
      setOpen(true)
      setMounted(true)
    }
  }, [forceOpenBody])

  return (
    <details
      className="agents-subdrawer"
      open={open}
      onToggle={(e) => {
        const el = e.currentTarget
        setOpen(el.open)
        if (el.open) {
          setMounted(true)
        }
      }}
    >
      <summary className="agents-subdrawer-summary">{summary}</summary>
      {mounted ? <div className="agents-subdrawer-body">{children}</div> : null}
    </details>
  )
}

export default function AgentsPage(): React.ReactElement {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('agent') ?? undefined
  const skillRiskRaw = searchParams.get('skillRisk')
  const skillRisk: SkillsSecuritySeverity | undefined =
    skillRiskRaw === 'high' || skillRiskRaw === 'medium' || skillRiskRaw === 'low' || skillRiskRaw === 'ok'
      ? skillRiskRaw
      : undefined
  /** 总览按危害筛选跳转时高亮 Cursor 卡片（未带 agent 查询参数时） */
  const focusAgentId = highlightId ?? (skillRisk ? 'cursor' : undefined)
  const drawerRef = useRef<Partial<Record<string, HTMLDetailsElement | null>>>({})
  const skillRiskScrollRef = useRef<HTMLLIElement | null>(null)

  const [rows, setRows] = useState<AgentArtifactsDetail[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [skillSecRows, setSkillSecRows] = useState<SkillSecurityItem[]>([])
  /** 主抽屉是否展开：`defaultOpen` 在异步数据就绪后不可靠，改为受控 */
  const [drawerOpen, setDrawerOpen] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listAgentArtifacts()
      setRows(data ?? placeholderAgentRows())
    } catch (e) {
      console.error('[AgentsPage] listAgentArtifacts failed', e)
      setRows(placeholderAgentRows())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setSkillSecRows(loadSkillsSecurityFromStorage()?.skills ?? [])
  }, [rows, loading])

  const sortedRows = useMemo(() => {
    const list = rows ?? placeholderAgentRows()
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { sensitivity: 'base' }))
  }, [rows])

  /** 仅列出环境扫描已识别的智能体 */
  const visibleRows = useMemo(() => sortedRows.filter((a) => a.installed), [sortedRows])

  useEffect(() => {
    if (loading || rows == null) {
      return
    }
    setDrawerOpen(() => {
      const next: Record<string, boolean> = {}
      for (const a of visibleRows) {
        const fromHighlight = highlightId ? a.id === highlightId : false
        const fromSkillFilter = skillRisk != null && a.id === 'cursor'
        /** 无深链且非 Skill 筛选时默认折叠 */
        next[a.id] = fromHighlight || fromSkillFilter
      }
      return next
    })
  }, [loading, rows, visibleRows, highlightId, skillRisk])

  const focusDrawerOpen = focusAgentId ? drawerOpen[focusAgentId] : false
  useEffect(() => {
    if (!focusAgentId || loading || rows == null || !focusDrawerOpen) {
      return
    }
    const t = window.setTimeout(() => {
      drawerRef.current[focusAgentId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 0)
    return () => clearTimeout(t)
  }, [focusAgentId, loading, rows, focusDrawerOpen])

  useEffect(() => {
    if (skillRisk == null || focusAgentId !== 'cursor' || loading) {
      return
    }
    const id = window.setTimeout(() => {
      skillRiskScrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 120)
    return () => clearTimeout(id)
  }, [skillRisk, focusAgentId, loading, visibleRows, skillSecRows])

  const openEntry = useCallback(async (path: string, isDir: boolean) => {
    if (!isElectronApp()) {
      return
    }
    if (isDir) {
      await openPath(path)
    } else {
      await showItemInFolder(path)
    }
  }, [])

  const openRoot = useCallback(async (path: string | null) => {
    if (path && isElectronApp()) {
      await openPath(path)
    }
  }, [])

  return (
    <div className="agents-page">
      <header className="agents-page-header">
        <h1 className="agents-page-title">{t('Ark.AgentsTitle')}</h1>
      </header>

      {isElectronApp() && skillRisk != null ? (
        <p className="muted agents-skill-risk-hint">{t('Ark.AgentsSkillRiskHint')}</p>
      ) : null}

      {!isElectronApp() ? (
        <div className="agents-browser-hint card">
          <p className="muted" style={{ margin: 0 }}>
            {t('Ark.AgentsBrowserOnly')}
          </p>
        </div>
      ) : null}

      {loading && rows == null ? (
        <p className="muted">{t('Ark.Loading')}</p>
      ) : visibleRows.length === 0 ? (
        <p className="muted agents-none-detected">{t('Ark.AgentsNoneDetected')}</p>
      ) : (
        <div className="agents-drawer-stack">
          {focusAgentId === 'cursor' && skillRisk != null && !visibleRows.some((a) => a.id === 'cursor') ? (
            <p className="muted agents-skill-risk-warn card">{t('Ark.AgentsSkillRiskFilterEmpty')}</p>
          ) : null}
          {visibleRows.map((agent, index) => (
            <details
              key={agent.id}
              ref={(el) => {
                drawerRef.current[agent.id] = el
              }}
              className={`agents-drawer card agents-drawer--stripe-${index % 2 === 0 ? 'a' : 'b'}${
                agent.id === focusAgentId ? ' agents-drawer--focus' : ''
              }`}
              open={drawerOpen[agent.id] ?? false}
              onToggle={(e) => {
                const el = e.currentTarget
                setDrawerOpen((p) => ({ ...p, [agent.id]: el.open }))
              }}
            >
              <summary className="agents-drawer-summary">
                <span className="agents-drawer-title">{agent.name}</span>
                <span className="agents-status agents-status--ok">{t('Ark.AgentsInstalled')}</span>
              </summary>
              {drawerOpen[agent.id] ? (
                <div className="agents-drawer-body">
                  {(() => {
                    const isCursorSkillFilter = agent.id === 'cursor' && skillRisk != null
                    const cursorSkillsMatchingRisk = isCursorSkillFilter
                      ? agent.skills.filter((e) => severityForSkillEntry(e, skillSecRows) === skillRisk)
                      : agent.skills
                    /** 筛选无匹配时仍展示全部 Skill，避免只看到空列表 */
                    const skillFilterNoMatch =
                      isCursorSkillFilter &&
                      cursorSkillsMatchingRisk.length === 0 &&
                      agent.skills.length > 0
                    const cursorSkillsForList = skillFilterNoMatch
                      ? agent.skills
                      : isCursorSkillFilter
                        ? cursorSkillsMatchingRisk
                        : agent.skills
                    const skillsEmptyLabel =
                      agent.skills.length === 0
                        ? t('Ark.AgentsEmptySkills')
                        : isCursorSkillFilter && cursorSkillsMatchingRisk.length === 0 && !skillFilterNoMatch
                          ? t('Ark.AgentsSkillRiskFilterEmpty')
                          : t('Ark.AgentsEmptySkills')
                    const expandSkills = isCursorSkillFilter
                    return (
                      <>
                  <LazyAgentsSubdrawer
                    forceOpenBody={expandSkills}
                    summary={
                      <>
                        {t('Ark.AgentsSkills')}{' '}
                        <span className="agents-count">
                          (
                          {isCursorSkillFilter
                            ? skillFilterNoMatch
                              ? `0/${agent.skills.length}`
                              : `${cursorSkillsMatchingRisk.length}/${agent.skills.length}`
                            : agent.skills.length}
                          )
                        </span>
                      </>
                    }
                  >
                    {skillFilterNoMatch ? (
                      <p className="muted agents-skill-filter-fallback">{t('Ark.AgentsSkillRiskFallbackAll')}</p>
                    ) : null}
                    <AgentSyncRoots
                      entries={agent.skills}
                      onOpenFolder={openRoot}
                      capVisibleRows={5}
                    />
                    <ArtifactList
                      items={cursorSkillsForList}
                      emptyLabel={skillsEmptyLabel}
                      onOpen={openEntry}
                      showSkillSecLabels={agent.id === 'cursor' || agent.id === 'hermes'}
                      skillRows={skillSecRows}
                      capVisibleRows={5}
                      firstItemScrollRef={
                        expandSkills && cursorSkillsMatchingRisk.length > 0 ? skillRiskScrollRef : undefined
                      }
                    />
                  </LazyAgentsSubdrawer>

                  <LazyAgentsSubdrawer
                    summary={
                      <>
                        {t('Ark.AgentsMemory')} <span className="agents-count">({agent.memory.length})</span>
                      </>
                    }
                  >
                    <AgentSyncRoots entries={agent.memory} onOpenFolder={openRoot} />
                    <ArtifactList
                      items={agent.memory}
                      emptyLabel={t('Ark.AgentsEmptyMemory')}
                      onOpen={openEntry}
                      showSkillSecLabels={false}
                      skillRows={skillSecRows}
                    />
                  </LazyAgentsSubdrawer>

                  <LazyAgentsSubdrawer
                    summary={
                      <>
                        {t('Ark.AgentsFiles')} <span className="agents-count">({agent.files.length})</span>
                      </>
                    }
                  >
                    <AgentSyncRoots entries={agent.files} onOpenFolder={openRoot} />
                    <ArtifactList
                      items={agent.files}
                      emptyLabel={t('Ark.AgentsEmptyFiles')}
                      onOpen={openEntry}
                      showSkillSecLabels={false}
                      skillRows={skillSecRows}
                    />
                  </LazyAgentsSubdrawer>
                      </>
                    )
                  })()}
                </div>
              ) : null}
            </details>
          ))}
        </div>
      )}
    </div>
  )
}
