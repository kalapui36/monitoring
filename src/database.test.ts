// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll } from 'vitest'
import { createHandler, hash } from '../supabase/functions/device/handler'
import type { SupabaseClient } from '@supabase/supabase-js'
let db: PGlite
const admin = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222'
const code = 'c'.repeat(64),
  token = 'd'.repeat(64),
  token2 = 'e'.repeat(64)
async function role(name: string, id = '') {
  await db.exec(`reset role;set role ${name};`)
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
}
async function scalar(sql: string, params: unknown[] = []) {
  return (await db.query<Record<string, any>>(sql, params)).rows[0]
}
async function seed(active = true) {
  await role('authenticated', admin)
  const row = await scalar("select public.app_save_class(null,'실제 학급','regular',true) as id")
  const classId = row.id
  await role('postgres')
  await db.query("insert into app_join_codes values($1,$2,now()+interval '1 hour',0,20)", [
    code,
    classId,
  ])
  await role('service_role')
  const r = await scalar("select app_register($1,$2,'학생 A',1) as data", [code, token])
  const studentId = r.data.studentId
  if (active) {
    await role('authenticated', admin)
    await db.query("select app_manage_student($1,'approve')", [studentId])
  }
  return { classId, studentId }
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select on storage.objects to authenticated;`,
  )
  const migration = readFileSync('supabase/migrations/202610220001_monitoring.sql', 'utf8')
  await db.exec(migration)
  await db.exec(migration) // base version only: apply before the teacher upgrade
  const teachers = readFileSync('supabase/migrations/202611040001_teacher_accounts.sql', 'utf8')
  await db.exec(teachers)
  await db.exec(teachers) // upgraded schema remains scoped on repeat
}, 30000)
beforeEach(async () => {
  await role('postgres')
  await db.exec('truncate app_classes,app_rate_limits,auth.users cascade;')
  await db.query('insert into auth.users values($1),($2)', [admin, other])
  await db.query('insert into app_admins(user_id) values($1)', [admin])
  await role('authenticated', admin)
  await db.query('select app_enroll_teacher()')
})
afterAll(async () => {
  await db.close()
})
describe('PostgreSQL migration + RLS + command transactions (PGlite)', () => {
  it('교사 가입 전에는 쓰기가 차단되고 교사 가입이 최고 관리자 권한을 주지 않는다', async () => {
    await role('authenticated', other)
    expect((await scalar('select app_is_admin() as ok')).ok).toBe(false)
    await expect(db.query('insert into app_admins(user_id) values($1)', [other])).rejects.toThrow(
      /permission denied/,
    )
    await expect(db.query("select app_save_class(null,'탈취','regular',true)")).rejects.toThrow(
      /교사/,
    )
    expect((await scalar('select app_enroll_teacher() as ok')).ok).toBe(true)
    expect((await scalar('select app_is_admin() as ok')).ok).toBe(false)
    expect((await scalar('select app_is_teacher() as ok')).ok).toBe(true)
    await expect(
      db.query("select app_save_class(null,'내 학급','regular',true)"),
    ).resolves.toBeDefined()
    await role('postgres')
    await expect(db.query('insert into app_admins(user_id) values($1)', [other])).rejects.toThrow(
      /unique/,
    )
  })
  it('익명·일반 사용자에게 학생/기록/명령/캡처와 기기 비밀을 공개하지 않는다', async () => {
    await seed()
    await role('authenticated', other)
    for (const table of [
      'app_classes',
      'app_students',
      'app_commands',
      'app_visits',
      'app_events',
      'app_captures',
      'app_latest_commands',
    ])
      expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0)
    for (const table of ['app_devices', 'app_join_codes'])
      await expect(db.query(`select * from ${table}`)).rejects.toThrow(/permission denied/)
    await expect(db.query("select app_device_exchange($1,'poll')", [token])).rejects.toThrow(
      /permission denied/,
    )
    await role('anon')
    await expect(db.query('select * from app_students')).rejects.toThrow(/permission denied/)
  })

  it('가입한 두 교사의 학급·학생·기록·명령·캡처를 RLS와 RPC로 격리한다', async () => {
    const { classId, studentId } = await seed()
    await role('authenticated', admin)
    const command = (
      await db.query<Record<string, any>>(
        "select * from app_issue_commands($1,$2::uuid[],'capture','',5,gen_random_uuid())",
        [classId, [studentId]],
      )
    ).rows[0]
    await role('service_role')
    await db.query("select app_device_exchange($1,'telemetry',$2::jsonb)", [
      token,
      JSON.stringify({
        visitId: crypto.randomUUID(),
        url: 'https://example.com/private',
        title: 'A 기록',
        duration: 10,
      }),
    ])
    await role('postgres')
    await db.query(
      "insert into app_captures(command_id,class_id,student_id,path,expires_at) values($1,$2,$3,'teacher-a.jpg',now()+interval '1 hour')",
      [command.id, classId, studentId],
    )
    await db.exec(
      "insert into storage.objects(bucket_id,name) values('student-captures','teacher-a.jpg')",
    )
    await role('authenticated', other)
    await db.query('select app_enroll_teacher()')
    const own = (await scalar("select app_save_class(null,'B 학급','club',false) as id")).id
    for (const table of [
      'app_students',
      'app_visits',
      'app_commands',
      'app_latest_commands',
      'app_events',
      'app_captures',
    ])
      expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0)
    expect((await db.query('select id from app_classes')).rows).toEqual([{ id: own }])
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0)
    await expect(
      db.query("select app_save_class($1,'탈취','regular',false)", [classId]),
    ).rejects.toThrow(/본인/)
    await expect(db.query("select app_manage_student($1,'approve')", [studentId])).rejects.toThrow(
      /학생/,
    )
    await expect(db.query("select app_manage_student($1,'revoke')", [studentId])).rejects.toThrow(
      /학생/,
    )
    await expect(db.query("select app_edit_student($1,'변조',5)", [studentId])).rejects.toThrow(
      /학생/,
    )
    await expect(
      db.query("select * from app_issue_commands($1,$2::uuid[],'unlock','',5,gen_random_uuid())", [
        classId,
        [studentId],
      ]),
    ).rejects.toThrow(/본인/)
    await expect(
      db.query('update app_classes set owner_id=$1 where id=$2', [other, classId]),
    ).rejects.toThrow(/permission denied/)
    await expect(db.query('insert into app_teachers(user_id) values($1)', [admin])).rejects.toThrow(
      /permission denied/,
    )
    await role('authenticated', admin)
    expect((await db.query('select id from app_classes')).rows).toEqual([{ id: classId }])
    expect((await db.query('select * from app_visits')).rows).toHaveLength(1)
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(1)
    expect(
      (await scalar('select approval from app_students where id=$1', [studentId])).approval,
    ).toBe('active')
  })
  it('이용 중지된 교사는 가입을 반복해도 재활성화하거나 기존 데이터를 읽지 못한다', async () => {
    await seed()
    await role('postgres')
    await db.query('update app_teachers set active=false where user_id=$1', [admin])
    await role('authenticated', admin)
    expect((await scalar('select app_is_teacher() as ok')).ok).toBe(false)
    expect((await db.query('select * from app_students')).rows).toHaveLength(0)
    await expect(db.query('select app_enroll_teacher()')).rejects.toThrow(/중지/)
    await role('anon')
    await expect(db.query('select app_enroll_teacher()')).rejects.toThrow(/permission denied/)
  })
  it('기존 단일 관리자의 학급을 소유자로 이관하고 새 회원에게 넘기지 않는다', async () => {
    await role('postgres')
    await db.exec("insert into app_classes(name) values('기존 학급')")
    const migration = readFileSync('supabase/migrations/202611040001_teacher_accounts.sql', 'utf8')
    await db.exec(migration)
    expect((await scalar("select owner_id from app_classes where name='기존 학급'")).owner_id).toBe(
      admin,
    )
    await role('authenticated', other)
    await db.query('select app_enroll_teacher()')
    expect((await db.query('select * from app_classes')).rows).toHaveLength(0)
  })
  it('승인 전 기기는 pending만 받고 코드 만료/사용 횟수를 강제한다', async () => {
    const { studentId } = await seed(false)
    await role('service_role')
    const pending = (await scalar("select app_device_exchange($1,'poll') as r", [token])).r
    expect(pending).toMatchObject({ state: 'pending', studentId })
    expect(pending.commands).toBeUndefined()
    await role('postgres')
    await db.exec("update app_join_codes set expires_at=now()-interval '1 second'")
    await role('service_role')
    await expect(db.query("select app_register($1,$2,'B',2)", [code, token2])).rejects.toThrow(
      /만료/,
    )
  })
  it('등록 재전송은 같은 기기를 반환하고 학생 번호 중복을 차단한다', async () => {
    const { studentId } = await seed(false)
    await role('service_role')
    expect(
      (await scalar("select app_register($1,$2,'다른 이름',99) as r", [code, token])).r.studentId,
    ).toBe(studentId)
    await expect(db.query("select app_register($1,$2,'B',1)", [code, token2])).rejects.toThrow(
      /unique/,
    )
  })
  it('자기 명령만 수신하고 다른 학생 명령의 적용 결과를 위조할 수 없다', async () => {
    const { classId, studentId } = await seed()
    await role('service_role')
    const otherStudent = (
      await scalar("select app_register($1,$2,'학생 B',2) as r", [code, token2])
    ).r.studentId
    await role('authenticated', admin)
    await db.query("select app_manage_student($1,'approve')", [otherStudent])
    const command = (
      await db.query<Record<string, any>>(
        "select * from app_issue_commands($1,$2::uuid[],'notice','공지',5,gen_random_uuid())",
        [classId, [studentId]],
      )
    ).rows[0]
    await role('service_role')
    const response = (await scalar("select app_device_exchange($1,'poll') as r", [token2])).r
    expect(response.commands).toHaveLength(0)
    await db.query("select app_device_exchange($1,'ack',$2::jsonb)", [
      token2,
      JSON.stringify({ acks: [{ id: command.id, status: 'applied' }] }),
    ])
    await role('postgres')
    expect((await scalar('select status from app_commands where id=$1', [command.id])).status).toBe(
      'queued',
    )
  })
  it('요청 ID 중복을 막고 늦은 잠금이 최신 해제를 덮지 못한다', async () => {
    const { classId, studentId } = await seed()
    await role('authenticated', admin)
    const request = crypto.randomUUID()
    const sql = "select * from app_issue_commands($1,$2::uuid[],'lock','집중',300,$3)"
    const a = (await db.query<Record<string, any>>(sql, [classId, [studentId], request])).rows[0]
    const b = (await db.query<Record<string, any>>(sql, [classId, [studentId], request])).rows[0]
    expect(a.id).toBe(b.id)
    await db.query(
      "select * from app_issue_commands($1,$2::uuid[],'unlock','',5,gen_random_uuid())",
      [classId, [studentId]],
    )
    await role('service_role')
    const r = (
      await scalar("select app_device_exchange($1,'poll',$2::jsonb) as r", [
        token,
        JSON.stringify({ acks: [{ id: a.id, status: 'applied' }] }),
      ])
    ).r
    expect(r.lock.enabled).toBe(false)
    expect(r.commands.map((c: any) => c.kind)).toEqual(['unlock'])
    await role('postgres')
    expect((await scalar('select status from app_commands where id=$1', [a.id])).status).toBe(
      'superseded',
    )
  })
  it('기록 OFF에서 방문 저장을 중지하지만 공지·해제를 유지한다', async () => {
    const { classId, studentId } = await seed()
    await role('authenticated', admin)
    await db.query("select app_save_class($1,'반','regular',false)", [classId])
    await db.query(
      "select * from app_issue_commands($1,$2::uuid[],'notice','안내',5,gen_random_uuid())",
      [classId, [studentId]],
    )
    await role('service_role')
    const r = (
      await scalar("select app_device_exchange($1,'telemetry',$2::jsonb) as r", [
        token,
        JSON.stringify({
          visitId: crypto.randomUUID(),
          url: 'https://example.com/',
          title: '시험',
          duration: 10,
        }),
      ])
    ).r
    expect(r.monitoring).toBe(false)
    expect(r.commands[0].kind).toBe('notice')
    await role('postgres')
    expect((await db.query('select * from app_visits')).rows).toHaveLength(0)
  })
  it('명령은 ACK 전 성공이 아니며 만료 뒤 ACK도 성공으로 바뀌지 않는다', async () => {
    const { classId, studentId } = await seed()
    await role('authenticated', admin)
    const c = (
      await db.query<Record<string, any>>(
        "select * from app_issue_commands($1,$2::uuid[],'capture','',5,gen_random_uuid())",
        [classId, [studentId]],
      )
    ).rows[0]
    expect(c.status).toBe('queued')
    await role('postgres')
    await db.query("update app_commands set expires_at=now()-interval '1 second' where id=$1", [
      c.id,
    ])
    await role('service_role')
    const r = (
      await scalar("select app_device_exchange($1,'ack',$2::jsonb) as r", [
        token,
        JSON.stringify({ acks: [{ id: c.id, status: 'applied' }] }),
      ])
    ).r
    expect(r.commands).toHaveLength(0)
    await role('postgres')
    expect((await scalar('select status from app_commands where id=$1', [c.id])).status).toBe(
      'expired',
    )
  })
  it('기기 등록 폐기 후 토큰은 더 이상 작동하지 않는다', async () => {
    const { studentId } = await seed()
    await role('authenticated', admin)
    await db.query("select app_manage_student($1,'revoke')", [studentId])
    await role('service_role')
    await expect(db.query("select app_device_exchange($1,'poll')", [token])).rejects.toThrow(
      /DEVICE_UNAUTHORIZED/,
    )
  })
  it('비공개 버킷은 관리자와 유효한 캡처 메타데이터를 모두 요구한다', async () => {
    const { classId, studentId } = await seed()
    await role('authenticated', admin)
    const command = (
      await db.query<Record<string, any>>(
        "select * from app_issue_commands($1,$2::uuid[],'capture','',5,gen_random_uuid())",
        [classId, [studentId]],
      )
    ).rows[0]
    await role('postgres')
    expect(
      (await scalar("select public from storage.buckets where id='student-captures'")).public,
    ).toBe(false)
    await db.exec(
      "insert into storage.objects(bucket_id,name) values('student-captures','private.jpg')",
    )
    await db.query(
      "insert into app_captures(command_id,class_id,student_id,path,expires_at) values($1,$2,$3,'private.jpg',now()+interval '1 hour')",
      [command.id, classId, studentId],
    )
    await role('authenticated', other)
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0)
    await role('authenticated', admin)
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(1)
    await role('postgres')
    await db.exec("update app_captures set expires_at=now()-interval '1 second'")
    await role('authenticated', admin)
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0)
  })
  it('실제 HTTP handler에서 등록→승인→명령→ACK→방문 기록→도움 요청을 PostgreSQL에 연결한다', async () => {
    await role('authenticated', admin)
    const classId = (await scalar("select app_save_class(null,'HTTP 학급','regular',true) as id"))
      .id
    const invite = 'a'.repeat(32),
      deviceSecret = 'K'.repeat(43)
    await role('postgres')
    await db.query("insert into app_join_codes values($1,$2,now()+interval '1 hour',0,20)", [
      await hash(invite),
      classId,
    ])
    const adapter = {
      rpc: async (name: string, args: Record<string, any>) => {
        try {
          await role('service_role')
          let row
          if (name === 'app_consume_rate')
            row = await scalar('select app_consume_rate($1,$2) as data', [args._key, args._limit])
          else if (name === 'app_register')
            row = await scalar('select app_register($1,$2,$3,$4) as data', [
              args._code,
              args._token,
              args._name,
              args._number,
            ])
          else if (name === 'app_device_exchange')
            row = await scalar('select app_device_exchange($1,$2,$3::jsonb) as data', [
              args._token,
              args._action,
              JSON.stringify(args._payload),
            ])
          else throw Error('unsupported test RPC')
          return { data: row.data, error: null }
        } catch (error) {
          return { data: null, error: { message: String((error as Error).message) } }
        }
      },
    }
    const handler = createHandler(
      { url: 'https://test.supabase.co', serviceKey: 'unused' },
      adapter as unknown as SupabaseClient,
    )
    async function call(action: string, body: Record<string, unknown> = {}, auth = true) {
      const r = await handler(
        new Request('https://test.supabase.co/functions/v1/device', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(auth ? { Authorization: 'Bearer ' + deviceSecret } : {}),
          },
          body: JSON.stringify({ action, securityVersion: 2, ...body }),
        }),
      )
      expect(r.status).toBe(200)
      return r.json()
    }
    const registration = await call(
      'register',
      { code: invite, secret: deviceSecret, name: 'HTTP 학생', number: 1 },
      false,
    )
    expect(registration.state).toBe('pending')
    expect((await call('poll')).commands).toBeUndefined()
    await role('authenticated', admin)
    await db.query("select app_manage_student($1,'approve')", [registration.studentId])
    const command = (
      await db.query<Record<string, any>>(
        "select * from app_issue_commands($1,$2::uuid[],'notice','실제 저장 검증',5,gen_random_uuid())",
        [classId, [registration.studentId]],
      )
    ).rows[0]
    const poll = await call('poll')
    expect(poll.commands[0].id).toBe(command.id)
    await call('ack', { payload: { acks: [{ id: command.id, status: 'applied' }] } })
    await call('telemetry', {
      payload: {
        visitId: crypto.randomUUID(),
        url: 'https://example.com/lesson?private=secret',
        title: '학습',
        duration: 30,
      },
    })
    await call('help')
    await role('postgres')
    expect((await scalar('select status from app_commands where id=$1', [command.id])).status).toBe(
      'applied',
    )
    expect(
      (await scalar('select url,duration_seconds from app_visits order by created_at limit 1')).url,
    ).toBe('https://example.com/lesson')
    await call('telemetry', {
      payload: {
        visitId: crypto.randomUUID(),
        url: 'chrome://camera-app/views/main.html?private=1',
        title: '원본 제목',
        duration: 5,
      },
    })
    await role('postgres')
    expect(
      (await scalar("select title from app_visits where url='chrome://camera-app/'")).title,
    ).toBe('카메라 앱')

    expect(
      (
        await scalar('select help_requested from app_students where id=$1', [
          registration.studentId,
        ])
      ).help_requested,
    ).toBe(true)
  })
  it('20/50/99명 등록과 일괄 명령을 처리하며 100번째 등록을 거부한다', async () => {
    for (const count of [20, 50, 99]) {
      await role('postgres')
      await db.exec('truncate app_classes cascade;')
      await role('authenticated', admin)
      const classId = (await scalar("select app_save_class(null,'규모 검증','club',true) as id")).id
      await role('postgres')
      await db.query("insert into app_join_codes values($1,$2,now()+interval '1 hour',0,99)", [
        code,
        classId,
      ])
      await role('service_role')
      for (let i = 1; i <= count; i++)
        await db.query('select app_register($1,$2,$3,$4)', [
          code,
          i.toString(16).padStart(64, '0'),
          '검증 학생 ' + i,
          i,
        ])
      await role('postgres')
      await db.exec("update app_students set approval='active'")
      await role('authenticated', admin)
      const ids = (await db.query<{ id: string }>('select id from app_students')).rows.map(
        (r) => r.id,
      )
      const commands = await db.query(
        "select * from app_issue_commands($1,$2::uuid[],'unlock','',5,gen_random_uuid())",
        [classId, ids],
      )
      expect(commands.rows).toHaveLength(count)
      if (count === 99) {
        await role('postgres')
        await db.query("insert into app_join_codes values($1,$2,now()+interval '1 hour',0,10)", [
          'f'.repeat(64),
          classId,
        ])
        await role('service_role')
        await expect(
          db.query("select app_register($1,$2,'한도 초과',100)", ['f'.repeat(64), 'z'.repeat(64)]),
        ).rejects.toThrow(/99명/)
        await role('authenticated', other)
        await db.query('select app_enroll_teacher()')
        const bClass = (
          await scalar("select app_save_class(null,'다른 교사 학급','regular',false) as id")
        ).id
        await role('postgres')
        await db.query("insert into app_join_codes values($1,$2,now()+interval '1 hour',0,20)", [
          'b'.repeat(64),
          bClass,
        ])
        await role('service_role')
        await expect(
          db.query("select app_register($1,$2,'B 학생',1)", ['b'.repeat(64), 'a'.repeat(64)]),
        ).resolves.toBeDefined()
      }
    }
  }, 15000)
})

// Keep the former shared-project tests above as migration/regression coverage.
// These tests then upgrade that same database to the final personal-project policy.
describe('개인 프로젝트 최종 소유자 제한', () => {
  beforeEach(async () => {
    await role('postgres')
    const migration = readFileSync('supabase/migrations/202611040002_personal_project.sql', 'utf8')
    await db.exec(migration)
    await db.exec(migration)
  })
  it('다른 Google 로그인은 가입·데이터 접근·소유자 탈취를 할 수 없다', async () => {
    const { studentId, classId } = await seed()
    await role('postgres')
    await db.query('insert into app_teachers(user_id) values($1)', [other]) // legacy shared member
    await role('authenticated', other)
    expect((await scalar('select app_is_teacher() as ok')).ok).toBe(false)
    await expect(db.query('select app_enroll_teacher()')).rejects.toThrow(/소유자/)
    expect((await db.query('select * from app_students')).rows).toHaveLength(0)
    expect((await db.query('select * from app_classes')).rows).toHaveLength(0)
    await expect(db.query('insert into app_admins(user_id) values($1)', [other])).rejects.toThrow(
      /permission denied/,
    )
    await expect(db.query("select app_manage_student($1,'revoke')", [studentId])).rejects.toThrow(
      /교사/,
    )
    await expect(
      db.query("select * from app_issue_commands($1,$2::uuid[],'unlock','',5,gen_random_uuid())", [
        classId,
        [studentId],
      ]),
    ).rejects.toThrow(/본인/)
  })
  it('수동 지정한 소유자는 자기 회원 가입과 실제 학생 제어를 계속 사용할 수 있다', async () => {
    const { studentId, classId } = await seed()
    await role('authenticated', admin)
    expect((await scalar('select app_enroll_teacher() as ok')).ok).toBe(true)
    const r = await db.query(
      "select * from app_issue_commands($1,$2::uuid[],'notice','개인 수업',5,gen_random_uuid())",
      [classId, [studentId]],
    )
    expect(r.rows).toHaveLength(1)
    await role('service_role')
    const response = (await scalar("select app_device_exchange($1,'poll') as r", [token])).r
    expect(response.commands[0].message).toBe('개인 수업')
  })
})
