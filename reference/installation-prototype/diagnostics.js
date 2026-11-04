export function installationStatus(config) {
  if (
    !config ||
    config.protocolVersion !== 1 ||
    config.channel !== 'development' ||
    config.backendReady !== false ||
    !config.classroom ||
    typeof config.classroom.id !== 'string' ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(config.classroom.id) ||
    typeof config.classroom.name !== 'string' ||
    !config.classroom.name.trim() ||
    config.classroom.name.length > 80
  ) {
    return {
      ok: false,
      code: 'INVALID_PACKAGE',
      message: '설치 파일 구성이 올바르지 않습니다. 교사 화면에서 새 개발용 ZIP을 받으세요.',
    }
  }
  return {
    ok: true,
    code: 'BACKEND_NOT_CONNECTED',
    classroomName: config.classroom.name,
    installed: true,
    registered: false,
    message: '확장 설치 확인 완료 · 학생 등록 서버 미연동. 대시보드에 등록된 상태가 아닙니다.',
  }
}
export function isSetupSender(sender, runtime) {
  return Boolean(sender && sender.id === runtime.id && sender.url === runtime.getURL('setup.html'))
}
