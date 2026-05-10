import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { AgentArtifactScanRule } from '../shared/agentArtifactScanRules.types.js'

/** 开发：项目根下 resources/；安装包：与 app 同级的 resources/（extraResources） */
export function resolveAgentArtifactScanRulesPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'agent-artifact-scan-rules.json')
  }
  return join(process.cwd(), 'resources', 'agent-artifact-scan-rules.json')
}

/**
 * 每次调用重新读取文件，便于用户改 JSON 后仅在客户端内点「刷新」即可生效。
 */
export function loadAgentArtifactScanRules(): Record<string, AgentArtifactScanRule> {
  const p = resolveAgentArtifactScanRulesPath()
  if (!existsSync(p)) {
    console.warn('[agent-artifact-scan] rules file not found:', p)
    return {}
  }
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>
    const out: Record<string, AgentArtifactScanRule> = {}
    for (const [key, val] of Object.entries(raw)) {
      if (key.startsWith('_')) {
        continue
      }
      if (val != null && typeof val === 'object' && !Array.isArray(val) && 'id' in (val as object)) {
        out[key] = val as AgentArtifactScanRule
      }
    }
    return out
  } catch (e) {
    console.error('[agent-artifact-scan] failed to parse rules file:', p, e)
    return {}
  }
}
