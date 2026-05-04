import { useEffect, useRef } from 'react'

export function usePoll(callback: () => void | Promise<void>, intervalMs: number, enabled: boolean): void {
  const cb = useRef(callback)
  cb.current = callback

  useEffect(() => {
    if (!enabled) {
      return
    }
    let cancelled = false
    const tick = async () => {
      try {
        await cb.current()
      } catch {
        /* caller handles */
      }
    }
    void tick()
    const id = window.setInterval(() => {
      if (!cancelled) {
        void tick()
      }
    }, intervalMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [intervalMs, enabled])
}
