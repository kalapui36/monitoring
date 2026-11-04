export type InstallationResult = {
  ok: boolean
  code: string
  message: string
  classroomName?: string
  installed?: boolean
  registered?: boolean
}
export function installationStatus(config: unknown): InstallationResult
export function isSetupSender(
  sender: { id?: string; url?: string } | undefined,
  runtime: { id: string; getURL: (path: string) => string },
): boolean
