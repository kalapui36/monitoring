export type Classroom = {
  id: string
  name: string
  kind: 'regular' | 'club' | 'external'
  monitoring: boolean
  retention_days: number
  capture_retention_days: number
}
export type Student = {
  id: string
  class_id: string
  name: string
  student_number: number
  approval: 'pending' | 'active' | 'revoked'
  last_seen: string | null
  active_url: string
  active_title: string
  duration_seconds: number
  help_requested: boolean
  last_error: string | null
}
export type Command = {
  id: string
  student_id: string
  kind: 'lock' | 'unlock' | 'notice' | 'capture'
  revision: number
  message: string
  status: 'queued' | 'delivered' | 'applied' | 'failed' | 'expired' | 'superseded'
  error: string | null
  expires_at: string
  created_at: string
  acknowledged_at: string | null
}
export function online(s: Student, now = Date.now()) {
  return s.approval === 'active' && !!s.last_seen && now - new Date(s.last_seen).getTime() < 120000
}
export function effectiveStatus(command: Command, now = Date.now()) {
  return ['queued', 'delivered'].includes(command.status) &&
    new Date(command.expires_at).getTime() <= now
    ? 'expired'
    : command.status
}
export function lockState(commands: Command[], studentId: string, now = Date.now()) {
  const cmd = commands
    .filter((c) => c.student_id === studentId && ['lock', 'unlock'].includes(c.kind))
    .sort((a, b) => b.revision - a.revision)[0]
  return (
    !!cmd &&
    cmd.kind === 'lock' &&
    cmd.status === 'applied' &&
    new Date(cmd.expires_at).getTime() > now
  )
}
export const statusNames: Record<string, string> = {
  queued: '전달 대기',
  delivered: '적용 확인 대기',
  applied: '기기 적용 확인',
  failed: '실패',
  expired: '기한 만료',
  superseded: '새 명령으로 대체',
}
