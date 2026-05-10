import type {
  SkillSecurityDetail,
  SkillsSecurityResult,
  SkillsSecuritySeverity
} from '../../../shared/skillsSecurityTypes'

/** 与总览页 Summary 共用，便于智能体页读取最近一次安全扫描明细 */
export const SKILLS_SEC_CACHE_KEY = 'ark-sync-summary-skills-security-v1'

function normalizeCachedResult(parsed: SkillsSecurityResult): SkillsSecurityResult {
  const hasSkillsArray = Array.isArray(parsed.skills)
  const skills = hasSkillsArray ? parsed.skills : []
  let low = typeof parsed.low === 'number' ? parsed.low : 0
  let ok = typeof parsed.ok === 'number' ? parsed.ok : 0

  if (!hasSkillsArray && typeof parsed.low === 'number') {
    /** 旧版：未命中高/中的 SKILL 全部计入 low，实为「健康」 */
    ok = parsed.low
    low = 0
  } else if (hasSkillsArray && typeof parsed.ok !== 'number') {
    ok = skills.filter((s) => s.severity === 'ok').length
  }

  const skillsNorm: SkillSecurityDetail[] = skills.map((s) => {
    const raw = s as SkillSecurityDetail & { findings?: unknown }
    return {
      path: raw.path,
      severity: raw.severity,
      findings: Array.isArray(raw.findings) ? raw.findings : []
    }
  })

  return {
    ...parsed,
    ok,
    low,
    skills: skillsNorm,
    gitleaksRegexRulesUsed:
      typeof parsed.gitleaksRegexRulesUsed === 'number' ? parsed.gitleaksRegexRulesUsed : 0
  }
}

export function loadSkillsSecurityFromStorage(): SkillsSecurityResult | null {
  try {
    const raw = localStorage.getItem(SKILLS_SEC_CACHE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as SkillsSecurityResult
    if (
      typeof parsed?.high !== 'number' ||
      typeof parsed?.medium !== 'number' ||
      typeof parsed?.skillFiles !== 'number' ||
      typeof parsed?.scannedAt !== 'number'
    ) {
      return null
    }
    return normalizeCachedResult(parsed)
  } catch {
    return null
  }
}

export function severityRank(s: SkillsSecuritySeverity): number {
  if (s === 'high') {
    return 3
  }
  if (s === 'medium') {
    return 2
  }
  if (s === 'low') {
    return 1
  }
  return 0
}

export function mergeSeverity(a: SkillsSecuritySeverity, b: SkillsSecuritySeverity): SkillsSecuritySeverity {
  return severityRank(a) >= severityRank(b) ? a : b
}

/** 路径比较用：统一分隔符与小写 */
export function normSkillPath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase()
}

export function persistSkillsSecurityToStorage(r: SkillsSecurityResult): void {
  try {
    localStorage.setItem(SKILLS_SEC_CACHE_KEY, JSON.stringify(r))
  } catch {
    /* quota / private mode */
  }
}
