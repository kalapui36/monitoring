// Redirect before loading Auth or reading saved connection/session information.
// Server-side HTTPS enforcement is still necessary against first-load network tampering.
export function httpsUpgrade(href: string): string | null {
  const url = new URL(href)
  if (url.protocol !== 'http:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    return null
  url.protocol = 'https:'
  return url.href
}
