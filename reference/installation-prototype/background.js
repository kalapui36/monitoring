import { installationStatus, isSetupSender } from './diagnostics.js'
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ installedVersion: chrome.runtime.getManifest().version })
  await chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') })
})
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!isSetupSender(sender, chrome.runtime) || message?.type !== 'INSTALLATION_STATUS')
    return false
  fetch(chrome.runtime.getURL('package-config.json'))
    .then((response) => {
      if (!response.ok) throw new Error('설치 설정을 읽지 못했습니다.')
      return response.json()
    })
    .then((config) => reply(installationStatus(config)))
    .catch(() =>
      reply({
        ok: false,
        code: 'PACKAGE_READ_FAILED',
        message: '설치 설정을 읽지 못했습니다. 파일을 모두 복사하고 확장을 새로고침하세요.',
      }),
    )
  return true
})
