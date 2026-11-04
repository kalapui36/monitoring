const el = (id) => document.getElementById(id)
async function message(payload) {
  const r = await chrome.runtime.sendMessage(payload)
  if (!r?.ok) throw Error(r?.error || '확장 통신을 확인하세요.')
  return r
}
async function refresh() {
  try {
    const r = await message({ type: 'STATUS' })
    el('register').hidden = ['pending', 'active'].includes(r.state)
    el('connected').hidden = r.state !== 'active'
    el('info').textContent = `${r.className} · ${r.name} · 기록 ${r.monitoring ? 'ON' : 'OFF'}`
    el('status').textContent =
      r.error ||
      {
        active:
          r.lastContact && Date.now() - r.lastContact < 120000
            ? '교사 승인 완료 · 연결됨'
            : '최근 연결을 확인하지 못했습니다. 다시 확인하세요.',
        pending: '교사 승인 대기 중',
        revoked: '등록이 폐기되었습니다. 교사에게 새 코드를 받으세요.',
        unregistered: '등록 정보를 입력하세요.',
      }[r.state] ||
      r.state
  } catch (e) {
    el('status').textContent = e.message
  }
}
el('register').onsubmit = async (event) => {
  event.preventDefault()
  el('submit').disabled = true
  try {
    await message({
      type: 'REGISTER',
      code: el('code').value,
      name: el('name').value,
      number: Number(el('number').value),
    })
    await refresh()
  } catch (e) {
    el('status').textContent = e.message
  } finally {
    el('submit').disabled = false
  }
}
el('help').onclick = async () => {
  el('help').disabled = true
  try {
    await message({ type: 'HELP' })
    el('status').textContent = '도움 요청을 서버에서 확인했습니다.'
  } catch (e) {
    el('status').textContent = e.message
  } finally {
    el('help').disabled = false
  }
}
el('refresh').onclick = async () => {
  await message({ type: 'SYNC' }).catch(() => {})
  await refresh()
}
setInterval(refresh, 5000)
void refresh()
