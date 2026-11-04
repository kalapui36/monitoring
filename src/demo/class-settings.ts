import { createClass, createClasses, type ClassKind, type Classroom } from './data'
export const SETTINGS_KEY = 'monitoring.demo.class-settings.v1'
const kinds: ClassKind[] = ['regular', 'club', 'external']
export function classValidation(classes: Classroom[], name: string, count: number): string {
  if (!name.trim() || name.trim().length > 30) return '학급 이름은 1~30자로 입력하세요.'
  if (classes.some((c) => c.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase()))
    return '같은 이름의 학급이 있습니다.'
  if (
    !Number.isInteger(count) ||
    count < 0 ||
    classes.reduce((n, c) => n + c.students.length, 0) + count > 99
  )
    return '가상 학생은 전체 99명까지 등록할 수 있습니다.'
  if (classes.length >= 20) return '학급은 최대 20개까지 만들 수 있습니다.'
  return ''
}
export function loadClasses(): Classroom[] {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return createClasses()
    const entries: unknown = JSON.parse(raw)
    if (!Array.isArray(entries) || !entries.length || entries.length > 20) return createClasses()
    const result: Classroom[] = []
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') return createClasses()
      const { id, name, kind, count, monitoring } = entry
      if (
        typeof id !== 'string' ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(id) ||
        result.some((c) => c.id === id) ||
        typeof name !== 'string' ||
        !kinds.includes(kind) ||
        typeof monitoring !== 'boolean' ||
        classValidation(result, name, count)
      )
        return createClasses()
      result.push({ ...createClass(id, name.trim(), kind, count), monitoring })
    }
    return result
  } catch {
    return createClasses()
  }
}
export function saveClasses(classes: Classroom[]): boolean {
  try {
    // Save class configuration only. Never retain commands, locks, captures, or history here.
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify(
        classes.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          count: c.students.length,
          monitoring: c.monitoring,
        })),
      ),
    )
    return true
  } catch {
    return false
  }
}
