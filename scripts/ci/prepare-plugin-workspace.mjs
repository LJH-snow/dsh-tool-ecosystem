#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = path.resolve(new URL('../..', import.meta.url).pathname)
const manifestPath = path.join(root, 'release', 'plugin-repositories.json')
const offline = process.argv.includes('--offline')

function fail(message) {
  console.error('release-check workspace: ' + message)
  process.exitCode = 1
}

if (!fs.existsSync(manifestPath)) {
  fail('missing repository manifest: ' + path.relative(root, manifestPath))
  process.exit()
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
if (!Array.isArray(manifest.repositories) || manifest.repositories.length === 0) {
  fail('repository manifest has no repositories')
  process.exit()
}

const manifestNames = new Set()
for (const entry of manifest.repositories) {
  if (!/^dsh-tool-[a-z0-9-]+$/.test(entry.name)) {
    fail('invalid plugin name in repository manifest: ' + entry.name)
    continue
  }
  if (manifestNames.has(entry.name)) {
    fail('duplicate plugin name in repository manifest: ' + entry.name)
    continue
  }
  manifestNames.add(entry.name)

  const target = path.join(root, entry.name)
  if (fs.existsSync(path.join(target, 'package.json'))) continue

  if (offline) {
    fail('plugin is missing in offline mode: ' + entry.name)
    continue
  }

  if (typeof entry.repository !== 'string' || !/^https:\/\/github\.com\/LJH-snow\/dsh-tool-[a-z0-9-]+\.git$/.test(entry.repository)) {
    fail('plugin is not checked in and has no approved public repository: ' + entry.name)
    continue
  }

  if (fs.existsSync(target)) {
    fail('plugin path exists without package.json; refusing to replace it: ' + entry.name)
    continue
  }

  console.log('Cloning ' + entry.name)
  const result = spawnSync('git', ['clone', '--depth=1', '--no-tags', entry.repository, target], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  })
  if (result.status !== 0) fail('clone failed for ' + entry.name)
}

// The release check scans every checked-in dsh-tool-* directory. Refuse an
// unregistered package so a new plugin cannot bypass the repository manifest.
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^dsh-tool-[a-z0-9-]+$/.test(entry.name)) continue
  if (!fs.existsSync(path.join(root, entry.name, 'package.json'))) continue
  if (!manifestNames.has(entry.name)) fail('plugin directory is not registered: ' + entry.name)
}

if (process.exitCode) process.exit(process.exitCode)
