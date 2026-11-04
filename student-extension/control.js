// Content scripts only wake the worker. No teacher message or device token is sent into page DOM.
;(() => {
  if (globalThis.__CLASS_ON_CONTROL__) return
  globalThis.__CLASS_ON_CONTROL__ = true
  function wake() {
    if (document.visibilityState === 'visible')
      chrome.runtime.sendMessage({ type: 'POLL' }).catch(() => {})
  }
  document.addEventListener('visibilitychange', wake)
  setInterval(wake, 5000)
  wake()
})()
