import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import { SyncthingClient, testConnection, type ClientOptions } from '../api/client'
import * as bridge from '../electronBridge'
import { isLocalSyncthingBase } from '../util/isLocalSyncthing'

type ConnectionState = {
  baseUrl: string
  apiKey: string
  rejectUnauthorized: boolean
  localSession?: boolean
  guiUser?: string
  guiPassword?: string
} | null

type Ctx = {
  connection: ConnectionState
  client: SyncthingClient | null
  ready: boolean
  error: string | null
  setConnection: (c: NonNullable<ConnectionState>) => Promise<void>
  disconnect: () => Promise<void>
  refresh: () => Promise<void>
}

const ConnectionContext = createContext<Ctx | null>(null)

function normalizeConn(raw: unknown): ConnectionState {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const o = raw as Record<string, unknown>
  const baseUrl = typeof o.baseUrl === 'string' ? o.baseUrl.trim() : ''
  const apiKey = typeof o.apiKey === 'string' ? o.apiKey.trim() : ''
  const guiUser = typeof o.guiUser === 'string' ? o.guiUser.trim() : ''
  const guiPassword = typeof o.guiPassword === 'string' ? o.guiPassword : ''
  const localSession = o.localSession === true && bridge.isElectronApp()
  if (!baseUrl) {
    return null
  }
  if (guiUser && !bridge.isElectronApp()) {
    return null
  }
  if (apiKey) {
    return {
      baseUrl,
      apiKey,
      rejectUnauthorized: o.rejectUnauthorized !== false,
      localSession: false
    }
  }
  if (bridge.isElectronApp() && guiUser) {
    return {
      baseUrl,
      apiKey: '',
      rejectUnauthorized: o.rejectUnauthorized !== false,
      localSession: false,
      guiUser,
      guiPassword
    }
  }
  if (localSession && isLocalSyncthingBase(baseUrl) && !apiKey) {
    return {
      baseUrl,
      apiKey: '',
      rejectUnauthorized: o.rejectUnauthorized !== false,
      localSession: true
    }
  }
  return null
}

export function ConnectionProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [connection, setConn] = useState<ConnectionState>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const raw = await bridge.getConnection()
      setConn(normalizeConn(raw))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setConn(null)
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const clientOpts: ClientOptions | null = useMemo(() => {
    if (!connection) {
      return null
    }
    return {
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey,
      rejectUnauthorized: connection.rejectUnauthorized,
      localSession: connection.localSession,
      guiUser: connection.guiUser,
      guiPassword: connection.guiPassword
    }
  }, [connection])

  const client = useMemo(() => (clientOpts ? new SyncthingClient(clientOpts) : null), [clientOpts])

  const setConnection = useCallback(async (c: NonNullable<ConnectionState>) => {
    setError(null)
    const payload = {
      baseUrl: c.baseUrl.trim(),
      apiKey: c.apiKey.trim(),
      rejectUnauthorized: c.rejectUnauthorized,
      localSession: c.localSession === true,
      guiUser: c.guiUser?.trim(),
      guiPassword: c.guiPassword ?? ''
    }
    if (payload.localSession) {
      if (!bridge.isElectronApp()) {
        throw new Error('「本机免密钥」仅能在 Electron 桌面窗口中使用；请运行 npm run dev 打开的窗口，或填写 API 密钥。')
      }
      if (!isLocalSyncthingBase(payload.baseUrl)) {
        throw new Error('免密钥仅允许本机地址（127.0.0.1 / localhost / ::1）。')
      }
    }
    if (payload.guiUser) {
      if (!bridge.isElectronApp()) {
        throw new Error('GUI 账户登录仅支持 Electron 窗口；请改用 API 密钥在浏览器中连接。')
      }
    }
    await testConnection({
      baseUrl: payload.baseUrl,
      apiKey: payload.apiKey,
      rejectUnauthorized: payload.rejectUnauthorized,
      localSession: payload.localSession,
      guiUser: payload.guiUser,
      guiPassword: payload.guiPassword
    })
    await bridge.setConnection({
      baseUrl: payload.baseUrl,
      apiKey: payload.apiKey,
      rejectUnauthorized: payload.rejectUnauthorized,
      localSession: payload.localSession,
      ...(payload.guiUser
        ? { guiUser: payload.guiUser, guiPassword: payload.guiPassword }
        : {})
    })
    const stored = await bridge.getConnection()
    setConn(normalizeConn(stored))
  }, [])

  const disconnect = useCallback(async () => {
    await bridge.clearConnection()
    setConn(null)
  }, [])

  const value = useMemo<Ctx>(
    () => ({
      connection,
      client,
      ready,
      error,
      setConnection,
      disconnect,
      refresh: load
    }),
    [connection, client, ready, error, setConnection, disconnect, load]
  )

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>
}

export function useConnection(): Ctx {
  const ctx = useContext(ConnectionContext)
  if (!ctx) {
    throw new Error('useConnection outside ConnectionProvider')
  }
  return ctx
}
