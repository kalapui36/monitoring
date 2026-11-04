// Generate dashboard-pasteable setup from the production sources; never embed credentials.
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const migrations = [
  '202610220001_monitoring.sql',
  '202611040001_teacher_accounts.sql',
  '202611040002_personal_project.sql',
  '202611040003_security_hardening.sql',
]
export async function buildSetupSources(root = process.cwd()) {
  const read = (p) => readFile(resolve(root, p), 'utf8')
  const sql =
    '-- ClassOn: new personal Supabase project installation. Execute the entire file.\n' +
    (
      await Promise.all(
        migrations.map(
          async (name) => '-- ' + name + '\n' + (await read('supabase/migrations/' + name)),
        ),
      )
    ).join('\n\n') +
    '\n\nselect public.app_security_version() as installed_security_version;\n'
  const activity = (await read('supabase/functions/device/activity.js'))
    .replace('const pages =', 'const pages: Readonly<Record<string,string>> =')
    .replace('const legacyApps =', 'const legacyApps: Readonly<Record<string,string>> =')
    .replace('export function internalActivity(value)', 'function internalActivity(value: string)')
  const handler = (await read('supabase/functions/device/handler.ts'))
    .replace(/^import .* from ['"]\.\/activity\.js['"]\r?\n/m, '')
    .replace(/^import .* from ['"]@supabase\/supabase-js['"]\r?\n/m, '')
  const entry = (await read('supabase/functions/device/index.ts')).replace(
    /^import .* from ['"]\.\/handler\.ts['"]\r?\n/m,
    '',
  )
  const functionSource =
    '// Generated from ClassOn production sources. Paste the whole file into device/index.ts.\n// Supabase supplies SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.\n' +
    "import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'\n\n" +
    activity +
    '\n' +
    handler +
    '\n' +
    entry
  return { sql, functionSource }
}
export async function writeSetupAssets(root = process.cwd()) {
  const { sql, functionSource } = await buildSetupSources(root)
  await mkdir(resolve(root, 'setup-files'), { recursive: true })
  await writeFile(resolve(root, 'setup-files/monitoring-install.sql'), sql)
  await writeFile(resolve(root, 'setup-files/device-dashboard.txt'), functionSource)
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await writeSetupAssets()
