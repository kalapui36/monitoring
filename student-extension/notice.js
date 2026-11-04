// Extension-only document. It is deliberately NOT listed as web_accessible_resources.
async function show() {
  if (window.top !== window.self) return
  try {
    const id = location.hash.slice(1)
    const response = await chrome.runtime.sendMessage({ type: 'NOTICE_READ', id })
    if (!response?.ok) throw Error(response?.error || '공지를 확인할 수 없습니다.')
    document.getElementById('message').textContent = String(response.text)
    document.getElementById('close').onclick = () => window.close()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const ready = await chrome.runtime.sendMessage({ type: 'NOTICE_READY', id })
    if (!ready?.ok) throw Error('표시 확인에 실패했습니다.')
    setTimeout(
      () => window.close(),
      Math.min(60, Math.max(1, Number(response.seconds) || 5)) * 1000,
    )
  } catch {
    document.getElementById('message').textContent =
      '공지 표시 기한이 지났거나 연결을 확인하지 못했습니다.'
  }
}
void show()
