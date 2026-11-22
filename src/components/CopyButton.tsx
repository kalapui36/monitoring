import { useState } from 'react'
import { Copy } from 'lucide-react'

export function CopyButton({
  label,
  value,
  fallback = '복사 권한을 확인하거나 화면에 표시된 값을 직접 복사하세요.',
}: {
  label: string
  value: string
  fallback?: string
}) {
  const [message, setMessage] = useState('')
  return (
    <div className="copy-control">
      <button
        className="button"
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setMessage('복사했어요.')
          } catch {
            setMessage(fallback)
          }
        }}
      >
        <Copy size={16} aria-hidden="true" />
        {label}
      </button>
      <span className="copy-message" role="status">
        {message}
      </span>
    </div>
  )
}
