// Do not initialize Auth or read data when a third-party site embeds the dashboard.
// GitHub Pages cannot set frame-ancestors headers; host-level headers remain preferable.
if (window.top !== window.self) {
  const root = document.getElementById('root')
  if (root)
    root.textContent =
      '보안을 위해 이 페이지는 다른 사이트 안에서 열 수 없습니다. 공식 주소로 직접 접속하세요.'
} else {
  void import('./bootstrap')
}
