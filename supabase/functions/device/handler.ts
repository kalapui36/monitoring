import { internalActivity } from './activity.js'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
export type ServerEnv = { url: string; serviceKey: string }
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('')
}
export function randomCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}
export function cleanUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 8192)
    throw new HttpError(400, '웹사이트 주소를 확인하세요.')
  const internal = internalActivity(value)
  if (internal) return internal.url
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol))
    throw new HttpError(400, '지원되는 웹페이지·Chrome 내부 앱 주소만 기록합니다.')
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  return url.href.slice(0, 2048)
}
function check(error: { message: string } | null) {
  if (error) {
    const device = /DEVICE_UNAUTHORIZED|DEVICE_REVOKED/.test(error.message)
    throw new HttpError(
      device ? 401 : 400,
      device
        ? '기기 인증이 만료되었거나 등록이 폐기되었습니다.'
        : '서버 작업을 완료하지 못했습니다. 입력·등록 상태와 서버 설정을 확인하세요.',
    )
  }
}
export async function readBody(req: Request): Promise<string> {
  const limit = 4100000
  if (Number(req.headers.get('content-length')) > limit)
    throw new HttpError(413, '요청 파일이 너무 큽니다.')
  if (!req.body) throw new HttpError(400, '요청 본문이 없습니다.')
  const reader = req.body.getReader(),
    decoder = new TextDecoder()
  let count = 0,
    text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      count += value.byteLength
      if (count > limit) {
        await reader.cancel()
        throw new HttpError(413, '요청 파일이 너무 큽니다.')
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}
export function createHandler(env: ServerEnv, supplied?: SupabaseClient) {
  const db =
    supplied ||
    createClient(env.url, env.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
      },
    })
  return async function handler(req: Request): Promise<Response> {
    const reply = (status: number, value: unknown) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      })
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST 요청만 허용합니다.' })
    try {
      const text = await readBody(req)
      if (text.length > 4_100_000) throw new HttpError(413, '요청 파일이 너무 큽니다.')
      const body = JSON.parse(text)
      if (!body || typeof body.action !== 'string')
        throw new HttpError(400, '요청 형식을 확인하세요.')
      if (
        !['issue_code', 'recovery_code', 'cleanup'].includes(body.action) &&
        body.securityVersion !== 2
      )
        throw new HttpError(
          426,
          '학생 확장 보안 업데이트가 필요합니다. 교사에게 새 ZIP을 받아 적용하세요.',
        )
      if (body.action !== 'capture' && text.length > 16384)
        throw new HttpError(413, '요청이 너무 큽니다.')
      const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || ''
      const teacher = async () => {
        const { data, error } = await db.auth.getUser(bearer)
        if (error || !data.user) throw new HttpError(401, '다시 로그인하세요.')
        const a = await db
          .from('app_teachers')
          .select('user_id')
          .eq('user_id', data.user.id)
          .eq('active', true)
          .maybeSingle()
        check(a.error)
        if (!a.data) throw new HttpError(403, '교사 회원가입 또는 이용 상태를 확인하세요.')
        const owner = await db
          .from('app_admins')
          .select('user_id')
          .eq('user_id', data.user.id)
          .maybeSingle()
        check(owner.error)
        if (!owner.data)
          throw new HttpError(403, '본인 개인 프로젝트의 소유자만 사용할 수 있습니다.')
        return data.user.id
      }
      const rate = async (key: string, limit: number) => {
        const r = await db.rpc('app_consume_rate', { _key: key, _limit: limit })
        check(r.error)
        if (!r.data) throw new HttpError(429, '요청이 많습니다. 잠시 후 다시 시도하세요.')
      }
      if (['issue_code', 'recovery_code', 'cleanup'].includes(body.action)) {
        const ownerId = await teacher()
        // Service credentials bypass RLS: every teacher action must scope explicitly.
        const classes = await db
          .from('app_classes')
          .select('id,retention_days')
          .eq('owner_id', ownerId)
        check(classes.error)
        const classIds = (classes.data || []).map((c) => c.id)
        if (body.action !== 'cleanup' && !uuid.test(body.classId || ''))
          throw new HttpError(400, '학급을 선택하세요.')
        if (body.action !== 'cleanup' && !classIds.includes(body.classId))
          throw new HttpError(403, '본인 학급만 관리할 수 있습니다.')
        if (body.action === 'cleanup' && !classIds.length)
          return reply(200, { ok: true, removedCaptures: 0 })
        if (body.action === 'issue_code') {
          const code = randomCode()
          const expiresAt = new Date(Date.now() + 3600000).toISOString()
          const r = await db.from('app_join_codes').insert({
            class_id: body.classId,
            code_hash: await hash(code),
            expires_at: expiresAt,
            max_uses: Math.max(1, Math.min(99, Number(body.maxUses) || 20)),
          })
          check(r.error)
          return reply(200, { ok: true, code, expiresAt })
        }
        if (body.action === 'recovery_code') {
          const code = randomCode()
          const r = await db
            .from('app_classes')
            .update({ recovery_hash: await hash(code) })
            .eq('id', body.classId)
            .eq('owner_id', ownerId)
          check(r.error)
          return reply(200, { ok: true, code })
        }
        const caps = await db
          .from('app_captures')
          .select('command_id,path')
          .in('class_id', classIds)
          .lt('expires_at', new Date().toISOString())
          .limit(500)
        check(caps.error)
        if (caps.data?.length) {
          const r = await db.storage.from('student-captures').remove(caps.data.map((c) => c.path))
          check(r.error)
          const d = await db
            .from('app_captures')
            .delete()
            .in(
              'command_id',
              caps.data.map((c) => c.command_id),
            )
          check(d.error)
        }
        for (const c of classes.data || []) {
          const cutoff = new Date(Date.now() - c.retention_days * 86400000).toISOString()
          for (const table of ['app_visits', 'app_events']) {
            const r = await db.from(table).delete().eq('class_id', c.id).lt('created_at', cutoff)
            check(r.error)
          }
        }
        const expiredCodes = await db
          .from('app_join_codes')
          .delete()
          .in('class_id', classIds)
          .lt('expires_at', new Date().toISOString())
        check(expiredCodes.error)
        return reply(200, { ok: true, removedCaptures: caps.data?.length || 0 })
      }
      if (body.action === 'register') {
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
        await rate('enroll-ip:' + (await hash(ip)), 10)
        await rate('enroll-global', 100)
        if (
          !/^[a-f0-9]{32}$/i.test(body.code || '') ||
          !/^[A-Za-z0-9_-]{43}$/.test(body.secret || '') ||
          typeof body.name !== 'string' ||
          body.name.trim().length < 1 ||
          body.name.trim().length > 40 ||
          !Number.isInteger(body.number) ||
          body.number < 1 ||
          body.number > 999
        )
          throw new HttpError(400, '참여 코드·이름·번호를 확인하세요.')
        const r = await db.rpc('app_register', {
          _code: await hash(body.code.toLowerCase()),
          _token: await hash(body.secret),
          _name: body.name.trim(),
          _number: body.number,
        })
        check(r.error)
        return reply(200, { ok: true, ...r.data })
      }
      if (!/^[A-Za-z0-9_-]{43}$/.test(bearer)) throw new HttpError(401, '기기 인증이 필요합니다.')
      const token = await hash(bearer)
      await rate('device:' + token, 40)
      if (body.action === 'capture') {
        if (!uuid.test(body.commandId || '') || typeof body.image !== 'string')
          throw new HttpError(400, '캡처 요청을 확인하세요.')
        const a = await db.rpc('app_device_exchange', {
          _token: token,
          _action: 'auth',
          _payload: { securityVersion: 2 },
        })
        check(a.error)
        if (a.data?.state !== 'active')
          throw new HttpError(403, '승인된 기기만 캡처를 업로드할 수 있습니다.')
        const cr = await db
          .from('app_commands')
          .select('*')
          .eq('id', body.commandId)
          .eq('student_id', a.data.studentId)
          .eq('kind', 'capture')
          .maybeSingle()
        check(cr.error)
        if (
          !cr.data ||
          new Date(cr.data.expires_at).getTime() <= Date.now() ||
          !['queued', 'delivered'].includes(cr.data.status)
        )
          throw new HttpError(409, '캡처 요청이 없거나 만료되었습니다.')
        const lock = await db
          .from('app_commands')
          .select('kind,status,expires_at')
          .eq('student_id', a.data.studentId)
          .in('kind', ['lock', 'unlock'])
          .order('revision', { ascending: false })
          .limit(1)
        check(lock.error)
        if (
          lock.data?.[0]?.kind === 'lock' &&
          ['delivered', 'applied', 'queued'].includes(lock.data[0].status) &&
          new Date(lock.data[0].expires_at).getTime() > Date.now()
        )
          throw new HttpError(409, '잠금을 먼저 해제하세요.')
        const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(body.image)
        if (!match) throw new HttpError(400, '이미지 형식을 확인하세요.')
        const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0))
        if (bytes.length > 3000000 || bytes.length < 8)
          throw new HttpError(413, '이미지 크기를 확인하세요.')
        const mime = match[1] === 'png' ? 'image/png' : 'image/jpeg'
        if (
          (mime === 'image/jpeg' && !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)) ||
          (mime === 'image/png' &&
            !(bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71))
        )
          throw new HttpError(400, '이미지 파일 서명이 다릅니다.')
        const path = `${cr.data.class_id}/${a.data.studentId}/${body.commandId}.${match[1] === 'png' ? 'png' : 'jpg'}`
        const group = await db
          .from('app_classes')
          .select('capture_retention_days')
          .eq('id', cr.data.class_id)
          .single()
        check(group.error)
        if (!group.data) throw new HttpError(404, '학급을 찾지 못했습니다.')
        const meta = await db.from('app_captures').upsert(
          {
            uploaded: false,
            command_id: body.commandId,
            class_id: cr.data.class_id,
            student_id: a.data.studentId,
            path,
            expires_at: new Date(
              Date.now() + group.data.capture_retention_days * 86400000,
            ).toISOString(),
          },
          { onConflict: 'command_id', ignoreDuplicates: true },
        )
        check(meta.error)
        // Reserve expiry metadata BEFORE storing bytes, so interrupted uploads remain tracked.
        // A pending reservation is unreadable through Storage RLS and absent from the UI.
        const upload = await db.storage
          .from('student-captures')
          .upload(path, bytes, { contentType: mime, upsert: false })
        check(upload.error)
        const completed = await db.rpc('app_complete_capture', {
          _token: token,
          _command: body.commandId,
        })
        check(completed.error)
        return reply(200, { ok: true })
      }
      if (!['poll', 'telemetry', 'ack', 'help', 'safety_release'].includes(body.action))
        throw new HttpError(400, '지원하지 않는 요청입니다.')
      const payload = body.payload || {}
      if (typeof payload !== 'object' || Array.isArray(payload))
        throw new HttpError(400, '요청 본문 형식을 확인하세요.')
      payload.securityVersion = 2
      if (body.action === 'telemetry') {
        if (
          !uuid.test(payload.visitId || '') ||
          !Number.isInteger(payload.duration) ||
          payload.duration < 0 ||
          payload.duration > 86400
        )
          throw new HttpError(400, '방문 기록을 확인하세요.')
        payload.url = cleanUrl(payload.url)
        payload.title =
          internalActivity(payload.url)?.title || String(payload.title || '').slice(0, 200)
      }
      if (
        payload.acks &&
        (!Array.isArray(payload.acks) ||
          payload.acks.length > 20 ||
          payload.acks.some(
            (a: { id: string; status: string }) =>
              !uuid.test(a.id) || !['applied', 'failed'].includes(a.status),
          ))
      )
        throw new HttpError(400, '명령 결과 형식을 확인하세요.')
      const r = await db.rpc('app_device_exchange', {
        _token: token,
        _action: body.action,
        _payload: payload,
      })
      check(r.error)
      return reply(200, { ok: true, ...r.data })
    } catch (error) {
      return reply(error instanceof HttpError ? error.status : 400, {
        ok: false,
        error:
          error instanceof HttpError
            ? error.message
            : '요청을 처리하지 못했습니다. 입력과 연결 상태를 확인하세요.',
      })
    }
  }
}
