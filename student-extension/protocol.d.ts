export function safeUrl(value: string): string
export function leaseValid(state: any, now?: number): boolean
export function lockFromResponse(previous: any, response: any, now?: number): any
export function track(
  previous: any,
  url: string,
  title: string,
  now?: number,
  newId?: () => string,
): any
export function digest(value: string): Promise<string>
export function secret(): string
export function trustedUi(sender: any, runtime: any): boolean
export function trustedNotice(sender: any, runtime: any, id: string): boolean
export const SECURITY_VERSION: number
