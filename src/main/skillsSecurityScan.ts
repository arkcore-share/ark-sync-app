import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { collectSkillSecurityScanSeeds } from './agentArtifactsScan.js'
import toml from 'toml'
import type {
  SkillSecurityDetail,
  SkillSecurityFinding,
  SkillsSecurityResult,
  SkillsSecuritySeverity
} from '../shared/skillsSecurityTypes.js'
import { gitleaksConfigPath } from './securityRulesSync.js'

const MAX_READ = 96 * 1024

/** 内置启发式（无规则文件时的兜底） */
const HIGH_RX =
  /(?:password|passwd|secret|api[_-]?key|apikey|credential|bearer\s|authorization:\s*Bearer|private[_-]?key|ssh-rsa|BEGIN\s+(?:RSA\s+)?PRIVATE)/i
const HIGH_RX2 =
  /(?:\beval\s*\(|new\s+Function\s*\(|child_process|exec(?:Sync)?\s*\(|spawn(?:Sync)?\s*\(|rm\s+-rf\b|format\s+[c-z]:|del\s+\/s|mkfs\.|dd\s+if=)/i

const MED_RX =
  /(?:\bfetch\s*\(|axios\.|http\.request|XMLHttpRequest|WebSocket\s*\(|openExternal\s*\(|shell\.open)/i
const MED_RX2 =
  /(?:writeFile(?:Sync)?\s*\(|appendFile(?:Sync)?\s*\(|unlink(?:Sync)?\s*\(|rmdir(?:Sync)?\s*\(|powershell|cmd\.exe|\/bin\/bash|\/bin\/sh\b)/i

type GitleaksTomlRule = {
  id?: string
  description?: string
  regex?: string
  tags?: string[]
}

type LoadedGlRule = {
  rx: RegExp
  high: boolean
  id?: string
  description?: string
}

function sevRank(s: SkillsSecuritySeverity): number {
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

function mergeSev(a: SkillsSecuritySeverity, b: SkillsSecuritySeverity): SkillsSecuritySeverity {
  return sevRank(a) >= sevRank(b) ? a : b
}

function isIgnoredSkillScanName(name: string): boolean {
  const n = name.toLowerCase()
  if (n.includes('.conflict-')) {
    return true
  }
  if (n.endsWith('~') || n.endsWith('.bak') || n.endsWith('.tmp') || n.endsWith('.orig') || n.endsWith('.rej')) {
    return true
  }
  if (n.startsWith('.#') || n.startsWith('#') || n.endsWith('#')) {
    return true
  }
  return false
}

function ruleLikelyHigh(r: GitleaksTomlRule): boolean {
  const tags = (r.tags ?? []).map((t) => String(t).toLowerCase())
  if (tags.some((t) => ['secret', 'private-key', 'api', 'aws', 'key', 'token'].includes(t))) {
    return true
  }
  const blob = `${r.id ?? ''} ${r.description ?? ''}`
  return /secret|password|private|key|token|credential|api/i.test(blob)
}

function loadGitleaksRegexRules(configPath: string): LoadedGlRule[] {
  if (!existsSync(configPath)) {
    return []
  }
  let doc: { rules?: GitleaksTomlRule[] }
  try {
    doc = toml.parse(readFileSync(configPath, 'utf8')) as { rules?: GitleaksTomlRule[] }
  } catch (e) {
    console.warn('[skills-security] gitleaks.toml parse failed', e)
    return []
  }
  const out: LoadedGlRule[] = []
  for (const r of doc.rules ?? []) {
    if (!r.regex || typeof r.regex !== 'string') {
      continue
    }
    let rx: RegExp
    try {
      rx = new RegExp(r.regex, 'mi')
    } catch {
      try {
        rx = new RegExp(r.regex)
      } catch {
        continue
      }
    }
    out.push({
      rx,
      high: ruleLikelyHigh(r),
      id: typeof r.id === 'string' ? r.id : undefined,
      description: typeof r.description === 'string' ? r.description : undefined
    })
  }
  return out
}

function findingKey(f: SkillSecurityFinding): string {
  if (f.kind === 'gitleaks') {
    return `gitleaks:${f.gitleaksRuleId ?? f.gitleaksDescription ?? '?'}`
  }
  return f.kind
}

function dedupeFindings(findings: SkillSecurityFinding[]): SkillSecurityFinding[] {
  const seen = new Set<string>()
  const out: SkillSecurityFinding[] = []
  for (const f of findings) {
    const k = findingKey(f)
    if (seen.has(k)) {
      continue
    }
    seen.add(k)
    out.push(f)
  }
  return out
}

function classifyBuiltinDetailed(text: string): {
  severity: SkillsSecuritySeverity
  findings: SkillSecurityFinding[]
} {
  const slice = text.slice(0, MAX_READ)
  const findings: SkillSecurityFinding[] = []
  let sev: SkillsSecuritySeverity = 'ok'

  if (HIGH_RX.test(slice)) {
    findings.push({ kind: 'builtin_secrets' })
    sev = mergeSev(sev, 'high')
  }
  if (HIGH_RX2.test(slice)) {
    findings.push({ kind: 'builtin_dangerous_exec' })
    sev = mergeSev(sev, 'high')
  }
  if (MED_RX.test(slice)) {
    findings.push({ kind: 'builtin_network' })
    sev = mergeSev(sev, 'medium')
  }
  if (MED_RX2.test(slice)) {
    findings.push({ kind: 'builtin_filesystem' })
    sev = mergeSev(sev, 'medium')
  }

  return { severity: sev, findings: dedupeFindings(findings) }
}

function classifyGitleaksDetailed(
  text: string,
  rules: LoadedGlRule[]
): { severity: SkillsSecuritySeverity | null; findings: SkillSecurityFinding[] } {
  const slice = text.slice(0, MAX_READ)
  let best: SkillsSecuritySeverity | null = null
  const findings: SkillSecurityFinding[] = []
  for (const r of rules) {
    try {
      if (r.rx.test(slice)) {
        const hit: SkillsSecuritySeverity = r.high ? 'high' : 'low'
        best = best == null ? hit : mergeSev(best, hit)
        findings.push({
          kind: 'gitleaks',
          gitleaksRuleId: r.id,
          gitleaksDescription: r.description
        })
      }
    } catch {
      /* invalid regex exec */
    }
  }
  return { severity: best, findings: dedupeFindings(findings) }
}

function collectSkillMdUnder(root: string): string[] {
  const out: string[] = []
  if (!existsSync(root)) {
    return out
  }
  const walk = (dir: string): void => {
    let entries: ReturnType<typeof readdirSync>
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (isIgnoredSkillScanName(e.name)) {
        continue
      }
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git') {
          continue
        }
        walk(p)
      } else if (e.isFile() && e.name.toLowerCase() === 'skill.md') {
        out.push(p)
      }
    }
  }
  walk(root)
  return out
}

function readSkillSnippet(path: string): string {
  try {
    return readFileSync(path, { encoding: 'utf8', flag: 'r' })
  } catch {
    return ''
  }
}

function normPathKey(p: string): string {
  return p.replace(/[/\\]+$/, '').replace(/\\/g, '/').toLowerCase()
}

/**
 * 合并规则推导目录与常见 Cursor skills 根（未写入产品目录时仍可检测）。
 */
function skillSecurityScanDirs(home: string, fromRules: string[]): string[] {
  const extra = [join(home, '.cursor', 'skills-cursor'), join(home, '.cursor', 'skills')]
  const out: string[] = []
  const seen = new Set<string>()
  for (const d of [...fromRules, ...extra]) {
    try {
      if (!existsSync(d) || !statSync(d).isDirectory()) {
        continue
      }
    } catch {
      continue
    }
    const k = normPathKey(d)
    if (seen.has(k)) {
      continue
    }
    seen.add(k)
    out.push(d)
  }
  return out
}

export async function scanSkillsSecurity(): Promise<SkillsSecurityResult> {
  const t0 = Date.now()

  const home = homedir()
  const seeds = collectSkillSecurityScanSeeds(home)
  const roots = skillSecurityScanDirs(home, seeds.dirs)
  const seen = new Set<string>()
  const paths: string[] = []
  for (const f of seeds.files) {
    if (!seen.has(f)) {
      seen.add(f)
      paths.push(f)
    }
  }
  for (const root of roots) {
    for (const p of collectSkillMdUnder(root)) {
      if (!seen.has(p)) {
        seen.add(p)
        paths.push(p)
      }
    }
  }

  const glRules = loadGitleaksRegexRules(gitleaksConfigPath())

  let high = 0
  let medium = 0
  let low = 0
  let ok = 0
  const skills: SkillSecurityDetail[] = []
  for (const p of paths) {
    const body = readSkillSnippet(p)
    const b = classifyBuiltinDetailed(body)
    const g = classifyGitleaksDetailed(body, glRules)
    let sev = mergeSev(b.severity, g.severity ?? 'ok')
    const findings = dedupeFindings([...b.findings, ...g.findings])

    /** 与最终等级一致：健康项不携带命中说明 */
    const findingsOut = sev === 'ok' ? [] : findings

    skills.push({ path: p, severity: sev, findings: findingsOut })
    if (sev === 'high') {
      high += 1
    } else if (sev === 'medium') {
      medium += 1
    } else if (sev === 'low') {
      low += 1
    } else {
      ok += 1
    }
  }

  return {
    high,
    medium,
    low,
    ok,
    skillFiles: paths.length,
    skills,
    gitleaksRegexRulesUsed: glRules.length,
    scannedAt: Date.now(),
    durationMs: Date.now() - t0
  }
}
