import { validPublicConfig } from './public-config'
export type ProjectConnection = { url: string; key: string }
export const CONNECTION_KEY = 'classon-personal-project-v1'
export function readConnection(): ProjectConnection | null {
  try {
    const value = JSON.parse(localStorage.getItem(CONNECTION_KEY) || 'null')
    return value && validPublicConfig(value.url, value.key) ? value : null
  } catch {
    return null
  }
}
export function saveConnection(value: ProjectConnection) {
  const connection = { url: value.url.trim().replace(/\/$/, ''), key: value.key.trim() }
  if (!validPublicConfig(connection.url, connection.key))
    throw Error(
      'HTTPS 프로젝트 URL과 공개 publishable/anon 키만 입력하세요. secret/service_role 키는 사용할 수 없습니다.',
    )
  try {
    localStorage.setItem(CONNECTION_KEY, JSON.stringify(connection))
  } catch {
    throw Error(
      '이 브라우저에서 연결 설정을 저장할 수 없습니다. 브라우저 저장소 허용 여부를 확인하세요.',
    )
  }
  return connection
}
export function removeConnection() {
  localStorage.removeItem(CONNECTION_KEY)
}
export function getProjectUrl() {
  return readConnection()?.url || ''
}
