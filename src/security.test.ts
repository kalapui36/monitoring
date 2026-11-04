// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { validPublicConfig } from './public-config'
import { buildSetupSources } from '../scripts/setup-assets.mjs'
const owner = '11111111-1111-4111-8111-111111111111',
  attacker = '22222222-2222-4222-8222-222222222222'
const token = 'a'.repeat(64),
  code = 'b'.repeat(64)
let db: PGlite
async function as(role: string, uid = '') {
  await db.exec(`reset role;set role ${role}`)
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid])
}
async function value(sql: string, args: unknown[] = []) {
  return (await db.query<Record<string, any>>(sql, args)).rows[0]
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated,anon;`,
  )
  await db.exec((await buildSetupSources()).sql)
  await db.exec(readFileSync('supabase/migrations/202611040003_security_hardening.sql', 'utf8'))
}, 30000)
beforeEach(async () => {
  await as('postgres')
  await db.exec('truncate app_classes,app_rate_limits,auth.users,storage.objects cascade')
  await db.query('insert into auth.users values($1),($2)', [owner, attacker])
  await db.query('insert into app_admins(user_id) values($1)', [owner])
  await as('authenticated', owner)
  await db.query('select app_enroll_teacher()')
})
afterAll(async () => {
  await db.close()
})
async function student() {
  await as('authenticated', owner)
  const classId = (await value("select app_save_class(null,'보안 검증 학급','regular',true) as id"))
    .id
  await as('postgres')
  await db.query("insert into app_join_codes values($1,$2,now()+interval '1 hour',0,20)", [
    code,
    classId,
  ])
  await as('service_role')
  const id = (await value("select app_register($1,$2,'가상 학생',1) as r", [code, token])).r
    .studentId
  await as('authenticated', owner)
  await db.query("select app_manage_student($1,'approve')", [id])
  return { classId, id }
}
it('공개 키 형식이어도 수집 서버·위장 Supabase 도메인은 연결하지 않는다', () => {
  const key = 'sb_publishable_' + 'a'.repeat(25)
  for (const url of [
    'https://collector.attacker.test',
    'https://project.supabase.co.attacker.test',
    'https://project.supabase.co:444',
  ])
    expect(validPublicConfig(url, key)).toBe(false)
})
it('악성 학생이 이미지 업로드 없이 캡처 성공 ACK를 위조할 수 없어야 한다', async () => {
  const s = await student()
  const command = (
    await db.query<Record<string, any>>(
      "select * from app_issue_commands($1,$2::uuid[],'capture','',5,gen_random_uuid())",
      [s.classId, [s.id]],
    )
  ).rows[0]
  await as('service_role')
  await db.query("select app_device_exchange($1,'ack',$2::jsonb)", [
    token,
    JSON.stringify({ securityVersion: 2, acks: [{ id: command.id, status: 'applied' }] }),
  ])
  await as('postgres')
  expect(
    (await value('select status from app_commands where id=$1', [command.id])).status,
  ).not.toBe('applied')
})
async function captureCommand() {
  const s = await student()
  const command = (
    await db.query<Record<string, any>>(
      "select * from app_issue_commands($1,$2::uuid[],'capture','',5,gen_random_uuid())",
      [s.classId, [s.id]],
    )
  ).rows[0]
  return { ...s, command }
}
async function reserve(c: Awaited<ReturnType<typeof captureCommand>>) {
  await as('postgres')
  await db.query(
    "insert into app_captures(command_id,class_id,student_id,path,expires_at) values($1,$2,$3,'reserved.jpg',now()+interval '1 day')",
    [c.command.id, c.classId, c.id],
  )
  await db.exec(
    "insert into storage.objects(bucket_id,name) values('student-captures','reserved.jpg')",
  )
}
it('미완료 업로드는 파일이 존재해도 Storage에서 읽지 못하고 서버 확정 후에만 조회된다', async () => {
  const c = await captureCommand()
  await reserve(c)
  await as('authenticated', owner)
  expect((await db.query('select * from storage.objects')).rows).toHaveLength(0)
  await as('service_role')
  await db.query('select app_complete_capture($1,$2)', [token, c.command.id])
  await as('authenticated', owner)
  expect((await db.query('select * from storage.objects')).rows).toHaveLength(1)
  for (const [r, uid] of [
    ['anon', ''],
    ['authenticated', attacker],
  ]) {
    await as(r, uid)
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0)
  }
  await as('postgres')
  await db.exec("update app_captures set expires_at=now()-interval '1 second'")
  await as('authenticated', owner)
  expect((await db.query('select * from storage.objects')).rows).toHaveLength(0)
})
it('이미지를 예약해도 학생의 캡처 성공 위조를 허용하지 않는다', async () => {
  const c = await captureCommand()
  await reserve(c)
  await as('service_role')
  await db.query("select app_device_exchange($1,'ack',$2::jsonb)", [
    token,
    JSON.stringify({ securityVersion: 2, acks: [{ id: c.command.id, status: 'applied' }] }),
  ])
  await as('postgres')
  expect(
    (await value('select status from app_commands where id=$1', [c.command.id])).status,
  ).not.toBe('applied')
})
it('다른 학생의 토큰으로 캡처 완료를 확정하거나 재사용할 수 없다', async () => {
  const c = await captureCommand()
  await reserve(c)
  await as('service_role')
  const tokenB = 'c'.repeat(64)
  const b = (await value("select app_register($1,$2,'가상 학생 B',2) as r", [code, tokenB])).r
    .studentId
  await as('authenticated', owner)
  await db.query("select app_manage_student($1,'approve')", [b])
  await as('service_role')
  await expect(
    db.query('select app_complete_capture($1,$2)', [tokenB, c.command.id]),
  ).rejects.toThrow(/CAPTURE/)
  await db.query('select app_complete_capture($1,$2)', [token, c.command.id])
  await expect(
    db.query('select app_complete_capture($1,$2)', [token, c.command.id]),
  ).rejects.toThrow(/CAPTURE/)
})
it('캡처 기한 만료·기기 폐기 이후에는 대기 업로드를 완료할 수 없다', async () => {
  const c = await captureCommand()
  await reserve(c)
  await as('postgres')
  await db.query("update app_commands set expires_at=now()-interval '1 second' where id=$1", [
    c.command.id,
  ])
  await as('service_role')
  await expect(
    db.query('select app_complete_capture($1,$2)', [token, c.command.id]),
  ).rejects.toThrow(/CAPTURE/)
  await as('authenticated', owner)
  await db.query("select app_manage_student($1,'revoke')", [c.id])
  await as('service_role')
  await expect(
    db.query('select app_complete_capture($1,$2)', [token, c.command.id]),
  ).rejects.toThrow(/DEVICE/)
  await as('authenticated', owner)
  expect((await db.query('select * from storage.objects')).rows).toHaveLength(0)
})
it('SQL injection 문자열은 이름 데이터로만 저장된다', async () => {
  const s = await student(),
    attack = "'); delete from app_admins;--"
  await as('authenticated', owner)
  await db.query('select app_edit_student($1,$2,1)', [s.id, attack])
  expect((await value('select name from app_students where id=$1', [s.id])).name).toBe(attack)
  expect((await value('select app_is_admin() as ok')).ok).toBe(true)
})
it('익명과 일반 로그인은 서비스 전용 함수를 실행하거나 소유자를 바꾸지 못한다', async () => {
  await student()
  for (const role of ['anon', 'authenticated']) {
    await as(role, attacker)
    for (const f of [
      'app_register(text,text,text,int)',
      'app_device_exchange(text,text,jsonb)',
      'app_consume_rate(text,int)',
      'app_complete_capture(text,uuid)',
    ])
      expect(
        (
          await value("select has_function_privilege(current_user,$1,'execute') as ok", [
            'public.' + f,
          ])
        ).ok,
      ).toBe(false)
    await expect(
      db.query('insert into app_admins(user_id) values($1)', [attacker]),
    ).rejects.toThrow(/permission/)
    await expect(
      db.query("insert into storage.objects(bucket_id,name) values('student-captures','evil.jpg')"),
    ).rejects.toThrow(/row-level security/)
  }
  await as('authenticated', attacker)
  await expect(db.query('select app_enroll_teacher()')).rejects.toThrow(/소유자/)
  for (const table of [
    'app_classes',
    'app_students',
    'app_visits',
    'app_events',
    'app_commands',
    'app_latest_commands',
    'app_captures',
  ])
    expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0)
})
it('소유자 이용 중지는 기기의 추가 수집·명령 수신도 거부한다', async () => {
  await student()
  await as('postgres')
  await db.query('update app_teachers set active=false where user_id=$1', [owner])
  await as('service_role')
  await expect(db.query("select app_device_exchange($1,'poll')", [token])).rejects.toThrow(
    /DEVICE_REVOKED/,
  )
})
it('등록 속도 제한은 같은 분의 요청 한도를 넘으면 거부한다', async () => {
  await as('service_role')
  for (let i = 0; i < 10; i++)
    expect((await value('select app_consume_rate($1,10) as ok', ['simulation-ip'])).ok).toBe(true)
  expect((await value('select app_consume_rate($1,10) as ok', ['simulation-ip'])).ok).toBe(false)
})
it('잔여 위험 재현: 탈취를 가정한 유효 소유자 세션과 서비스 권한은 데이터에 접근한다', async () => {
  await student()
  // A stolen valid identity is indistinguishable from the legitimate identity at this RLS boundary.
  await as('authenticated', owner)
  expect((await db.query('select * from app_students')).rows).toHaveLength(1)
  await as('service_role')
  expect((await db.query('select * from app_students')).rows).toHaveLength(1)
})

it('SQL만 먼저 갱신해도 이전 서버의 무표식 폴링에 명령을 반환하지 않는다', async () => {
  await student()
  await as('service_role')
  await expect(
    db.query("select app_device_exchange($1,'poll','{}'::jsonb)", [token]),
  ).rejects.toThrow(/DEVICE_SECURITY_UPDATE_REQUIRED/)
})
