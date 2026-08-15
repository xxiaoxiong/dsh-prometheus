import { access, readFile } from 'node:fs/promises'

const requiredFiles = [
  'lib/index.js',
  'lib/index.d.ts',
  'cordis.patch.yml',
  'README.md',
  'README.zh.md',
  'LICENSE',
]

const manifest = JSON.parse(await readFile('package.json', 'utf8'))
const failures = []

if (manifest.name !== 'dsh-prometheus') failures.push('package name must be dsh-prometheus')
if (manifest.private === true) failures.push('package must not be private')
if (manifest.license !== 'MIT') failures.push('package license must match LICENSE')
if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') failures.push('dsh.bundle.patch is missing or incorrect')
if (manifest.main !== 'lib/index.js') failures.push('main must point at the built host entry')
if (manifest.types !== 'lib/index.d.ts') failures.push('types must point at the built declaration entry')

const published = JSON.stringify(manifest.files ?? [])
for (const forbidden of ['src', 'test', 'coverage', 'docs/research']) {
  if (published.includes(forbidden)) failures.push(`files allowlist unexpectedly includes ${forbidden}`)
}

for (const file of requiredFiles) {
  try {
    await access(file)
  } catch {
    failures.push(`required package file is missing: ${file}`)
  }
}

const patch = await readFile('cordis.patch.yml', 'utf8')
if (!patch.includes("name: 'dsh-prometheus'")) failures.push('bundle patch does not insert dsh-prometheus')

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`check-pack: ${failure}\n`)
  process.exitCode = 1
} else {
  process.stdout.write('check-pack: package metadata and required artifacts are ready\n')
}
