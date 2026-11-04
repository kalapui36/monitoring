import { readFileSync } from 'node:fs'
import vm from 'node:vm'
it('방문한 웹사이트에는 공지 수신기나 공지 원문을 제공하지 않는다', () => {
  const addListener = vi.fn(),
    sendMessage = vi.fn().mockResolvedValue({ ok: true })
  vm.runInNewContext(readFileSync('student-extension/control.js', 'utf8'), {
    document,
    chrome: { runtime: { onMessage: { addListener }, sendMessage } },
    setInterval: vi.fn(),
  })
  expect(addListener).not.toHaveBeenCalled()
  expect(sendMessage).toHaveBeenCalledWith({ type: 'POLL' })
  expect(document.documentElement.textContent).not.toContain('공지 원문')
  const manifest = JSON.parse(readFileSync('student-extension/manifest.json', 'utf8'))
  expect(manifest.web_accessible_resources).toBeUndefined()
})
it('전용 공지 창은 HTML을 텍스트로만 표시하고 표시 확인을 전송한다', async () => {
  document.body.innerHTML = '<p id="message"></p><button id="close"></button>'
  const sendMessage = vi.fn(async (m) =>
    m.type === 'NOTICE_READ'
      ? { ok: true, text: '<img src=x onerror="globalThis.noticeAttack=true">', seconds: 5 }
      : { ok: true },
  )
  const view = { close: vi.fn() }
  Object.assign(view, { top: view, self: view })
  vm.runInNewContext(readFileSync('student-extension/notice.js', 'utf8'), {
    document,
    window: view,
    location: { hash: '#11111111-1111-4111-8111-111111111111' },
    chrome: { runtime: { sendMessage } },
    setTimeout: vi.fn(),
    requestAnimationFrame: (cb: () => void) => cb(),
  })
  await new Promise((r) => setTimeout(r, 0))
  expect(document.getElementById('message')!.textContent).toContain('<img src=x')
  expect(document.querySelector('img')).toBeNull()
  expect(sendMessage).toHaveBeenCalledWith({
    type: 'NOTICE_READY',
    id: '11111111-1111-4111-8111-111111111111',
  })
})
