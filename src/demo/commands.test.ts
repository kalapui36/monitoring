import {
  CommandFailure,
  DemoTransport,
  delay,
  withRetry,
  type Command,
  type StudentIssue,
} from './commands'
const issue: StudentIssue = {
  operation: 'connection',
  code: 'TRANSIENT',
  cause: 'timeout',
  solution: 'retry',
  retryable: true,
}
const command: Command = { id: 'same-command-id', type: 'lock', text: '수업 중' }
describe('명령 전송과 복구 정책', () => {
  it('일시 오류만 500ms, 1000ms 간격으로 최대 2회 재시도한다', async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(new CommandFailure(issue))
      .mockRejectedValueOnce(new CommandFailure(issue))
      .mockResolvedValue('ok')
    const wait = vi.fn().mockResolvedValue(undefined)
    const notify = vi.fn()
    await expect(withRetry(task, new AbortController().signal, notify, wait)).resolves.toBe('ok')
    expect(task).toHaveBeenCalledTimes(3)
    expect(wait.mock.calls.map((c) => c[0])).toEqual([500, 1000])
    expect(notify.mock.calls.map((c) => c[0])).toEqual([1, 2])
  })
  it('계속 실패하면 성공으로 바꾸지 않고 최종 오류를 반환한다', async () => {
    const failure = new CommandFailure(issue)
    const task = vi.fn().mockRejectedValue(failure)
    await expect(
      withRetry(
        task,
        new AbortController().signal,
        undefined,
        vi.fn().mockResolvedValue(undefined),
      ),
    ).rejects.toBe(failure)
    expect(task).toHaveBeenCalledTimes(3)
  })
  it('권한 오류와 알 수 없는 오류는 무한 재시도하지 않는다', async () => {
    for (const error of [
      new CommandFailure({ ...issue, retryable: false }),
      new Error('unexpected'),
    ]) {
      const task = vi.fn().mockRejectedValue(error)
      await expect(withRetry(task, new AbortController().signal)).rejects.toBe(error)
      expect(task).toHaveBeenCalledTimes(1)
    }
  })
  it('중지된 요청은 실행하지 않으며 지연 중 중지도 타이머를 해제한다', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    controller.abort()
    const task = vi.fn()
    await expect(withRetry(task, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(task).not.toHaveBeenCalled()
    const second = new AbortController()
    const sleeping = delay(1000, second.signal)
    const rejected = expect(sleeping).rejects.toMatchObject({ name: 'AbortError' })
    second.abort()
    await rejected
    expect(vi.getTimerCount()).toBe(0)
  })
  it('응답 직전 취소되면 성공으로 반환하지 않는다', async () => {
    const controller = new AbortController()
    await expect(
      withRetry(async () => {
        controller.abort()
        return true
      }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('가상 오류는 대상 학생에게만 적용되며 같은 명령으로 복구한다', async () => {
    const transport = new DemoTransport()
    transport.simulateTransient('student-a')
    const send = vi.fn(() => transport.execute('student-a', command))
    await expect(transport.execute('student-b', command)).resolves.toBeUndefined()
    await expect(
      withRetry(
        send,
        new AbortController().signal,
        undefined,
        vi.fn().mockResolvedValue(undefined),
      ),
    ).resolves.toBeUndefined()
    expect(send).toHaveBeenCalledTimes(2)
  })
  it('캡처 미연동은 성공 이미지 대신 재시도 불가능한 오류를 반환한다', async () => {
    await expect(
      new DemoTransport().execute('student-a', { ...command, type: 'capture' }),
    ).rejects.toMatchObject({ issue: { code: 'EXTENSION_NOT_CONNECTED', retryable: false } })
  })
})
