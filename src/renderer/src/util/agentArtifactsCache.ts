import type { AgentArtifactsDetail } from '../../../shared/agentArtifactsTypes'

const CACHE_KEY = 'ark_agent_artifacts_cache'
const CACHE_TTL_MS = 5 * 60 * 1000

interface CachedData {
  data: AgentArtifactsDetail[]
  timestamp: number
}

export function getAgentArtifactsFromCache(): AgentArtifactsDetail[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) {
      return null
    }
    const cached: CachedData = JSON.parse(raw)
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY)
      return null
    }
    return cached.data
  } catch {
    return null
  }
}

export function setAgentArtifactsCache(data: AgentArtifactsDetail[]): void {
  try {
    const cached: CachedData = {
      data,
      timestamp: Date.now()
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
  } catch {
    /* ignore storage errors */
  }
}

export function clearAgentArtifactsCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* ignore */
  }
}