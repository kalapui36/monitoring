import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectionSetup } from './ConnectionSetup'
import { readConnection } from '../connection'
it('연결 폼은 비밀키를 거부하고 공개 설정만 연결한다', async () => {
  const onConnect = vi.fn(),
    user = userEvent.setup()
  render(<ConnectionSetup onConnect={onConnect} onGuide={() => {}} />)
  await user.type(screen.getByLabelText('내 Supabase Project URL'), 'https://teacher.supabase.co')
  const input = screen.getByLabelText('내 Supabase 공개 Publishable key')
  await user.type(input, 'sb_secret_invalid')
  await user.click(screen.getByRole('button', { name: '내 프로젝트에 연결' }))
  expect(screen.getByRole('alert')).toHaveTextContent('공개')
  expect(onConnect).not.toHaveBeenCalled()
  await user.clear(input)
  await user.type(input, 'sb_publishable_' + 'a'.repeat(25))
  await user.click(screen.getByRole('button', { name: '내 프로젝트에 연결' }))
  expect(onConnect).toHaveBeenCalledWith(readConnection())
})
