// Only activities exposed by Chrome tabs/windows can be observed. This is not OS app enumeration.
const pages = Object.freeze({
  'chrome://camera-app/': '카메라 앱',
  'chrome-untrusted://camera-app/': '카메라 앱',
  'chrome://file-manager/': '파일 앱',
  'chrome://os-settings/': '크롬북 설정',
  'chrome://settings/': 'Chrome 설정',
  'chrome://newtab/': '새 탭',
})
const legacyApps = Object.freeze({
  hfhhnacclhffhdffklopdkcgdhifgngh: 'chrome://camera-app/',
  hhaomjibdihmijegdhdafkllkbggdgoj: 'chrome://file-manager/',
})
export function internalActivity(value) {
  try {
    const url = new URL(value)
    if (url.username || url.password || url.port) return null
    const root =
      url.protocol === 'chrome-extension:'
        ? legacyApps[url.hostname]
        : `${url.protocol}//${url.hostname}/`
    return Object.hasOwn(pages, root) ? { url: root, title: pages[root] } : null
  } catch {
    return null
  }
}
