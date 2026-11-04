import { classValidation, loadClasses, saveClasses, SETTINGS_KEY } from './class-settings'
import { createClass, createClasses } from './data'
describe('학급 설정 보관과 경계 검증', () => {
  it('학급별 ON/OFF와 학생 범위를 복원하고 잠금·오류·기록은 저장하지 않는다', () => {
    const classes = createClasses()
    classes[0].monitoring = false
    classes[0].students[0].locked = true
    classes.push(createClass('new-group', '외부 수업', 'external', 20))
    expect(saveClasses(classes)).toBe(true)
    const serialized = localStorage.getItem(SETTINGS_KEY)!
    for (const key of ['lockMessage', 'issues', 'visits', 'pending', 'helpRequested'])
      expect(serialized).not.toContain(key)
    const restored = loadClasses()
    expect(restored.map((c) => c.monitoring)).toEqual([false, true, false])
    expect(restored.map((c) => c.students.length)).toEqual([20, 12, 20])
    expect(restored[0].students[0].locked).toBe(false)
    expect(new Set(restored.flatMap((c) => c.students.map((s) => s.id))).size).toBe(52)
  })
  it('빈 이름·중복 이름·비정상 인원·100명 이상을 거부하고 99명까지 허용한다', () => {
    const classes = createClasses()
    for (const [name, count] of [
      [' ', 0],
      [' 1학년 3반 ', 20],
      ['신규', 68],
      ['신규', -1],
      ['신규', 1.5],
      ['신규', NaN],
    ] as const)
      expect(classValidation(classes, name, count)).not.toBe('')
    expect(classValidation(classes, '외부 수업', 67)).toBe('')
    expect(classValidation(classes, '빈 학급', 0)).toBe('')
  })
  it('손상되거나 조작된 저장 데이터에서 안전하게 기본 학급으로 복구한다', () => {
    for (const raw of [
      'invalid',
      'null',
      '[]',
      '[{}]',
      JSON.stringify([{ id: 'x', name: 'x', kind: 'regular', count: 100, monitoring: true }]),
    ]) {
      localStorage.setItem(SETTINGS_KEY, raw)
      expect(loadClasses().map((c) => c.id)).toEqual(['class-1', 'club-1'])
    }
  })
  it('저장소 사용이 차단되어도 앱을 중단하지 않는다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(saveClasses(createClasses())).toBe(false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadClasses()).toHaveLength(2)
  })
})
