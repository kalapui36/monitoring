import { existsSync, readFileSync, writeFileSync } from 'node:fs'
if (existsSync('CNAME')) {
  const domain = readFileSync('CNAME', 'utf8').trim()
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain))
    throw Error('CNAME에는 도메인 이름만 입력하세요.')
  writeFileSync('dist/CNAME', domain + '\n')
}
