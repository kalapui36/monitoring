import { afterEach } from 'vitest'
type Sender = { id: string; url: string }
type Handler = (
  message: { type: string },
  sender: Sender,
  reply: (result: unknown) => void,
) => boolean
const config = {
  protocolVersion: 1,
  channel: 'development',
  backendReady: false,
  classroom: { id: 'class-1', name: '가상 학급' },
}
async function loadWorker() {
  vi.resetModules()
  const messages = vi.fn<(handler: Handler) => void>()
  const installed = vi.fn<(handler: () => Promise<void>) => void>()
  const runtime = {
    id: 'unit-test-extension',
    getURL: (path: string) => `chrome-extension://unit-test-extension/${path}`,
    getManifest: () => ({ version: '0.2.0' }),
    onMessage: { addListener: messages },
    onInstalled: { addListener: installed },
  }
  const chrome = {
    runtime,
    storage: { local: { set: vi.fn().mockResolvedValue(undefined) } },
    tabs: { create: vi.fn().mockResolvedValue(undefined) },
  }
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => config })
  vi.stubGlobal('chrome', chrome)
  vi.stubGlobal('fetch', fetcher)
  await import('../../reference/installation-prototype/background.js')
  return {
    chrome,
    fetcher,
    handler: messages.mock.calls[0][0],
    install: installed.mock.calls[0][0],
    sender: { id: runtime.id, url: runtime.getURL('setup.html') },
  }
}
afterEach(() => vi.unstubAllGlobals())
describe('설치 진단 service worker (Chrome API 모의)', () => {
  it('설치 시 버전을 보관하고 로컬 설치 화면을 연다', async () => {
    const { install, chrome } = await loadWorker()
    await install()
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ installedVersion: '0.2.0' })
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: chrome.runtime.getURL('setup.html') })
  })
  it('내부 요청은 로컬 구성만 읽으며 학생 등록 완료로 응답하지 않는다', async () => {
    const { handler, sender, fetcher } = await loadWorker()
    const reply = vi.fn()
    expect(handler({ type: 'INSTALLATION_STATUS' }, sender, reply)).toBe(true)
    await vi.waitFor(() =>
      expect(reply).toHaveBeenCalledWith(
        expect.objectContaining({ installed: true, registered: false }),
      ),
    )
    expect(fetcher).toHaveBeenCalledWith(
      'chrome-extension://unit-test-extension/package-config.json',
    )
  })
  it('외부 페이지와 임의 API 중계 요청을 거부한다', async () => {
    const { handler, sender, fetcher } = await loadWorker()
    const reply = vi.fn()
    expect(
      handler({ type: 'INSTALLATION_STATUS' }, { ...sender, url: 'https://example.com' }, reply),
    ).toBe(false)
    expect(handler({ type: 'API' }, sender, reply)).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
    expect(reply).not.toHaveBeenCalled()
  })
  it('파일 읽기 실패를 성공 대신 복구 안내로 반환한다', async () => {
    const { handler, sender, fetcher } = await loadWorker()
    const reply = vi.fn()
    fetcher.mockRejectedValue(new Error('missing'))
    handler({ type: 'INSTALLATION_STATUS' }, sender, reply)
    await vi.waitFor(() =>
      expect(reply).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false, code: 'PACKAGE_READ_FAILED' }),
      ),
    )
  })
})
