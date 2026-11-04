export function validPublicConfig(url: string, key: string): boolean {
  try {
    if (!validProjectUrl(url) || !key || /YOUR_|sb_secret_|service_role/.test(key)) return false
    if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key)) return true
    const value = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return value.role === 'anon'
  } catch {
    return false
  }
}

// Hosted Supabase only. Custom/self-hosted endpoints need a separate trust/CSP design.
export function validProjectUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.port &&
      u.pathname === '/' &&
      !u.search &&
      !u.hash &&
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.supabase\.co$/.test(u.hostname)
    )
  } catch {
    return false
  }
}
