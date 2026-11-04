export type Operation = 'connection' | 'lock' | 'unlock' | 'notice' | 'capture'
export type Command = { id: string; type: Exclude<Operation, 'connection'>; text: string }
export type StudentIssue = {
  operation: Operation
  code: string
  cause: string
  solution: string
  retryable: boolean
}
export const operationLabels: Record<Operation, string> = {
  connection: '연결',
  lock: '잠금',
  unlock: '해제',
  notice: '공지',
  capture: '캡처',
}
export class CommandFailure extends Error {
  constructor(public issue: StudentIssue) {
    super(issue.cause)
  }
}
export function offlineIssue(operation: Operation): StudentIssue {
  return {
    operation,
    code: 'DEVICE_OFFLINE',
    cause: '학생 기기의 접속 신호가 없습니다.',
    solution:
      '크롬북의 인터넷과 확장 실행 상태를 확인하세요. 연결이 복구된 뒤 다시 시도하세요. 오프라인 중에는 잠금·공지 명령을 예약하지 않습니다.',
    retryable: false,
  }
}
export function cancelled() {
  return new DOMException('작업 취소', 'AbortError')
}
export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(cancelled())
      return
    }
    const abort = () => {
      clearTimeout(timer)
      reject(cancelled())
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}
// Only explicit transient failures are retried. Authorization/permission errors are not.
// Real adapters must reuse the same command ID across retries to prevent duplicate delivery.
export async function withRetry<T>(
  task: () => Promise<T>,
  signal: AbortSignal,
  onRetry: (attempt: number) => void = () => {},
  wait: typeof delay = delay,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (signal.aborted) throw cancelled()
    try {
      const value = await task()
      if (signal.aborted) throw cancelled()
      return value
    } catch (error) {
      if (signal.aborted) throw cancelled()
      if (!(error instanceof CommandFailure) || !error.issue.retryable || attempt >= 2) throw error
      onRetry(attempt + 1)
      await wait(500 * 2 ** attempt, signal)
    }
  }
}
export class DemoTransport {
  private failures = new Map<string, number>()
  simulateTransient(studentId: string, failures = 1) {
    this.failures.set(studentId, failures)
  }
  async execute(studentId: string, command: Command): Promise<void> {
    if (command.type === 'capture')
      throw new CommandFailure({
        operation: 'capture',
        code: 'EXTENSION_NOT_CONNECTED',
        cause: '현재 앱에는 학생 확장 및 캡처 API가 연결되어 있지 않습니다.',
        solution:
          '학생용 ZIP 확장과 서버를 연동하고 ChromeOS에서 캡처 권한·학교 정책을 검증해야 합니다. 현재는 실제 화면을 가져올 수 없습니다.',
        retryable: false,
      })
    const left = this.failures.get(studentId) || 0
    if (left) {
      this.failures.set(studentId, left - 1)
      throw new CommandFailure({
        operation: command.type,
        code: 'TRANSIENT_NETWORK',
        cause: '가상 통신 오류가 발생했습니다.',
        solution:
          '최대 2회 자동 재시도합니다. 계속 실패하면 인터넷과 확장 상태를 확인한 뒤 다시 시도하세요.',
        retryable: true,
      })
    }
  }
}
