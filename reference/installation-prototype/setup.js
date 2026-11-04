const status = document.getElementById('status')
const classroom = document.getElementById('classroom')
const retry = document.getElementById('retry')
async function check() {
  retry.disabled = true
  status.textContent = '설치 상태 확인 중…'
  try {
    const result = await chrome.runtime.sendMessage({ type: 'INSTALLATION_STATUS' })
    if (!result || typeof result.message !== 'string') throw new Error('확장 응답이 없습니다.')
    classroom.textContent = result.classroomName
      ? `설치 대상 학급: ${result.classroomName}`
      : '학급 설정 확인 필요'
    status.textContent = result.message
    status.dataset.state = result.ok ? 'installed' : 'error'
  } catch {
    status.textContent =
      '확장 통신을 확인하지 못했습니다. chrome://extensions에서 이 확장을 새로고침하세요.'
    status.dataset.state = 'error'
  } finally {
    retry.disabled = false
  }
}
retry.addEventListener('click', check)
void check()
