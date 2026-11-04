import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { validPublicConfig } from './public-config'
export { validPublicConfig } from './public-config'
import { readConnection, type ProjectConnection } from './connection'
export function createProjectClient(connection: ProjectConnection): SupabaseClient {
  if (!validPublicConfig(connection.url, connection.key))
    throw Error('공개 연결 설정을 확인하세요.')
  return createClient(connection.url, connection.key, {
    global: {
      fetch: (url, options) =>
        fetch(url, {
          ...options,
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          credentials: 'omit',
          redirect: 'error',
          signal: options?.signal || AbortSignal.timeout(15000),
        }),
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  })
}
// Never fall back to a distributor-owned project, including old VITE variables.
const connection = readConnection()
export const client = connection ? createProjectClient(connection) : null
export function resolveOAuthRedirect(base: string, href: string) {
  return new URL(base, href).href
}
export function oauthRedirect() {
  return resolveOAuthRedirect(import.meta.env.BASE_URL, window.location.href)
}
export async function edge<T>(
  db: SupabaseClient,
  action: string,
  values: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await db.functions.invoke('device', { body: { action, ...values } })
  if (error) {
    let message = '서버 요청에 실패했습니다. 로그인과 Edge Function 배포 상태를 확인하세요.'
    try {
      const payload = await error.context.json()
      message = payload.error || message
    } catch {
      /* no response */
    }
    throw new Error(message)
  }
  if (!data?.ok) throw new Error(data?.error || '처리 결과를 확인하지 못했습니다.')
  return data as T
}
