import { leaseValid } from './protocol.js'
async function render() {
  const { lock } = await chrome.storage.local.get('lock')
  if (!leaseValid(lock)) {
    document.getElementById('message').textContent = '잠금이 해제되었습니다.'
    await chrome.runtime.sendMessage({ type: 'HEALTH' }).catch(() => {})
    window.close()
    return
  }
  document.getElementById('message').textContent = lock.message
}
async function recover() {
  const code = prompt('교사가 발급한 비상 해제 코드를 입력하세요.')
  if (!code) return
  try {
    const r = await chrome.runtime.sendMessage({ type: 'RECOVER', code })
    if (!r?.ok) throw Error(r?.error || '해제 실패')
    await render()
  } catch (e) {
    document.getElementById('status').textContent = e.message
  }
}
document.getElementById('recover').onclick = recover
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.shiftKey && e.code === 'KeyK') {
    e.preventDefault()
    void recover()
  }
})
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.lock) void render()
})
setInterval(() => {
  void render()
  void chrome.runtime.sendMessage({ type: 'POLL' }).catch(() => {})
}, 3000)
void render()
