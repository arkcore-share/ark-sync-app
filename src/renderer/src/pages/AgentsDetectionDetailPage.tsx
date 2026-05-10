import type { TFunction } from 'i18next'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import type {
  SkillSecurityDetail,
  SkillSecurityFinding,
  SkillsSecuritySeverity
} from '../../../shared/skillsSecurityTypes'
import { isElectronApp, showItemInFolder } from '../electronBridge'
import { loadSkillsSecurityFromStorage, severityRank } from '../util/skillsSecurityStorage'

function findingCopy(f: SkillSecurityFinding, t: TFunction): { problem: string; fix: string; fallback: string } {
  if (f.kind === 'gitleaks') {
    const fromRule =
      (f.gitleaksDescription && f.gitleaksDescription.trim()) ||
      (f.gitleaksRuleId ? `[${f.gitleaksRuleId}]` : '')
    return {
      problem: fromRule || t('Ark.SkillFindGitleaksProblemGeneric'),
      fix: t('Ark.SkillFindGitleaksFix'),
      fallback: t('Ark.SkillFindGitleaksFallback')
    }
  }
  const key = f.kind
  const map: Record<string, string> = {
    builtin_secrets: 'BuiltinSecrets',
    builtin_dangerous_exec: 'BuiltinDangerousExec',
    builtin_network: 'BuiltinNetwork',
    builtin_filesystem: 'BuiltinFilesystem'
  }
  const sfx = map[key]
  return {
    problem: t(`Ark.SkillFind${sfx}Problem`),
    fix: t(`Ark.SkillFind${sfx}Fix`),
    fallback: t(`Ark.SkillFind${sfx}Fallback`)
  }
}

function severityLabel(sev: SkillSecurityDetail['severity'], t: TFunction): string {
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

export default function AgentsDetectionDetailPage(): React.ReactElement {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const skillRiskRaw = searchParams.get('skillRisk')
  const skillRiskFilter: SkillsSecuritySeverity | undefined =
    skillRiskRaw === 'high' || skillRiskRaw === 'medium' || skillRiskRaw === 'low' || skillRiskRaw === 'ok'
      ? skillRiskRaw
      : undefined

  const [data, setData] = useState(() => loadSkillsSecurityFromStorage())

  useEffect(() => {
    setData(loadSkillsSecurityFromStorage())
  }, [searchParams])

  const showOkFilterHint = skillRiskFilter === 'ok'

  const riskySorted = useMemo(() => {
    const skills = data?.skills ?? []
    let list = skills.filter((x) => x.severity !== 'ok')
    if (showOkFilterHint) {
      return []
    }
    if (skillRiskFilter && skillRiskFilter !== 'ok') {
      list = list.filter((x) => x.severity === skillRiskFilter)
    }
    return list.sort((a, b) => {
      const d = severityRank(b.severity) - severityRank(a.severity)
      if (d !== 0) {
        return d
      }
      return a.path.localeCompare(b.path, undefined, { sensitivity: 'base' })
    })
  }, [data, skillRiskFilter, showOkFilterHint])

  const revealSkillFile = useCallback(async (p: string) => {
    if (!isElectronApp()) {
      return
    }
    await showItemInFolder(p)
  }, [])

  return (
    <div className="agents-page agents-detection-page">
      <header className="agents-page-header">
        <h1 className="agents-page-title">{t('Ark.AgentsDetectionTitle')}</h1>
      </header>

      {!isElectronApp() ? (
        <div className="agents-browser-hint card">
          <p className="muted" style={{ margin: 0 }}>
            {t('Ark.AgentsBrowserOnly')}
          </p>
        </div>
      ) : null}

      {isElectronApp() && data == null ? (
        <p className="muted agents-detection-empty">{t('Ark.AgentsDetectionNoCache')}</p>
      ) : null}

      {showOkFilterHint ? (
        <p className="muted agents-detection-empty">{t('Ark.AgentsDetectionFilterOkEmpty')}</p>
      ) : null}

      {skillRiskFilter != null && skillRiskFilter !== 'ok' ? (
        <p className="muted agents-detection-filter-banner">
          {t('Ark.AgentsDetectionFilterBanner', { level: severityLabel(skillRiskFilter, t) })}
        </p>
      ) : null}

      {isElectronApp() && data != null && riskySorted.length === 0 && !showOkFilterHint ? (
        <p className="muted agents-detection-empty">
          {skillRiskFilter != null && skillRiskFilter !== 'ok'
            ? t('Ark.AgentsDetectionFilterTierEmpty')
            : t('Ark.AgentsDetectionEmpty')}
        </p>
      ) : null}

      {riskySorted.length > 0 ? (
        <div className="agents-detection-stack">
          {riskySorted.map((row) => (
            <article
              key={row.path}
              className={`agents-detection-card card agents-detection-card--${row.severity}`}
            >
              <div className="agents-detection-card-head">
                <span className={`agents-detection-sev agents-detection-sev--${row.severity}`}>
                  {severityLabel(row.severity, t)}
                </span>
                <code className="agents-detection-path">{row.path}</code>
                {isElectronApp() ? (
                  <button
                    type="button"
                    className="agents-linkish"
                    onClick={() => void revealSkillFile(row.path)}
                  >
                    {t('Ark.AgentsDetectionOpenFile')}
                  </button>
                ) : null}
              </div>

              <h2 className="agents-detection-findings-title">{t('Ark.AgentsDetectionFindings')}</h2>
              {row.findings.length === 0 ? (
                <p className="muted agents-detection-no-findings">{t('Ark.AgentsDetectionNoFindingDetail')}</p>
              ) : (
                <ul className="agents-detection-finding-list">
                  {row.findings.map((f, i) => {
                    const c = findingCopy(f, t)
                    return (
                      <li key={`${findingKey(f)}-${i}`} className="agents-detection-finding">
                        <p className="agents-detection-problem">{c.problem}</p>
                        <div className="agents-detection-fix-block">
                          <div className="agents-detection-fix-label">{t('Ark.AgentsDetectionHowToFix')}</div>
                          <p className="agents-detection-fix-text">{c.fix}</p>
                        </div>
                        <div className="agents-detection-fallback-block">
                          <div className="agents-detection-fallback-label">{t('Ark.AgentsDetectionIfNotFixed')}</div>
                          <p className="agents-detection-fallback-text">{c.fallback}</p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </article>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function findingKey(f: SkillSecurityFinding): string {
  if (f.kind === 'gitleaks') {
    return `gitleaks:${f.gitleaksRuleId ?? f.gitleaksDescription ?? ''}`
  }
  return f.kind
}
