#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const releaseDir = path.join(root, 'release')
const args = new Set(process.argv.slice(2))
const runMatrix = !args.has('--no-matrix')
const strictOutput = args.has('--strict-output')

function pluginDirs() {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('dsh-tool-') && fs.existsSync(path.join(root, entry.name, 'package.json')))
    .map(entry => entry.name)
    .sort()
}

function sourceFiles(dir) {
  const result = []
  function walk(current) {
    if (!fs.existsSync(current)) return
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'lib' || entry.name === '.git' || entry.name === '.mimosa') continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name)) result.push(full)
    }
  }
  walk(path.join(dir, 'src'))
  return result
}

function toolNames(dir) {
  const names = new Set()
  for (const file of sourceFiles(dir)) {
    const source = fs.readFileSync(file, 'utf8')
    for (const match of source.matchAll(/\bname\s*:\s*['"]([^'"]+)['"]/g)) {
      const value = match[1]
      if (value.startsWith('dsh-') || value.includes('_')) names.add(value)
    }
  }
  return [...names].sort()
}

function packageInventory() {
  return pluginDirs().map(name => {
    const dir = path.join(root, name)
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    return { name, packageName: pkg.name, version: pkg.version, path: name, tools: toolNames(dir), scripts: pkg.scripts ?? {} }
  })
}

function writeJson(file, value) {
  fs.mkdirSync(releaseDir, { recursive: true })
  fs.writeFileSync(path.join(releaseDir, file), JSON.stringify(value, null, 2) + '\n')
}

function scanCredentials(inventory) {
  const findings = []
  const patterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /(?:sk_(?:live|test)_|rk_(?:live|test)_|shpat_|ghp_|github_pat_|xox[abprs]-|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|ya29\.[0-9A-Za-z_-]{20,}|npm_[A-Za-z0-9]{20,})/,
    /\bBearer\s+[A-Za-z0-9._-]{32,}/i,
    /(?:accessToken|apiKey|clientSecret|password|privateKey)\s*[:=]\s*['"][^'"]{32,}['"]/
  ]
  for (const item of inventory) {
    const files = [...sourceFiles(path.join(root, item.name)), path.join(root, item.name, 'README.md'), path.join(root, item.name, 'README.zh.md'), path.join(root, item.name, 'examples', 'cordis.yml')]
    for (const file of files) {
      if (!fs.existsSync(file)) continue
      const relative = path.relative(root, file)
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
      lines.forEach((line, index) => {
        if (line.includes('example.com') || line.includes('your_') || line.includes('YOUR_') || line.includes('${') || /x{4,}|X{4,}|xxx|replace|short-lived|read_only|\.\.\./i.test(line)) return
        if (patterns.some(pattern => pattern.test(line))) findings.push({ file: relative, line: index + 1, kind: 'credential-like literal' })
      })
    }
  }
  return findings
}

const allowedHosts = new Set([
  'api.airtable.com', 'api.cloudflare.com', 'api.figma.com', 'api.firecrawl.dev', 'api.github.com', 'api.linear.app', 'api.notion.com', 'api.pagerduty.com',
  'context7.com', 'discord.com', 'gitlab.com', 'gmail.googleapis.com', 'graph.microsoft.com', 'hub.docker.com', 'open.feishu.cn', 'open.larksuite.com',
  'oauth2.googleapis.com', 'www.googleapis.com', 'docs.googleapis.com', 'sheets.googleapis.com', 'api.stripe.com', 'api.shopify.com', 'sentry.io', 'slack.com',
])

function scanEndpoints(inventory) {
  const findings = []
  const urls = /https?:\/\/([A-Za-z0-9._${{}-]+)/g
  for (const item of inventory) {
    for (const file of sourceFiles(path.join(root, item.name))) {
      const relative = path.relative(root, file)
      const source = fs.readFileSync(file, 'utf8')
      for (const match of source.matchAll(urls)) {
        const host = match[1].toLowerCase().replace(/[.']+$/, '')
        if (!host || host.includes('${') || host.endsWith('.') || host.endsWith('.example.com') || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) continue
        if (allowedHosts.has(host) || host.endsWith('.atlassian.net') || host.endsWith('.myshopify.com') || host.endsWith('.sentry.io')) continue
        findings.push({ file: relative, host, kind: 'endpoint is not in the repository allowlist' })
      }
    }
  }
  return findings
}

function scanOutputLimits(inventory) {
  const scoped = new Set(['dsh-tool-mongodb', 'dsh-tool-sql', 'dsh-tool-kubernetes', 'dsh-tool-monitoring', 'dsh-tool-shopify'])
  const findings = []
  for (const item of inventory) {
    const source = sourceFiles(path.join(root, item.name)).map(file => fs.readFileSync(file, 'utf8')).join('\n')
    const bounded = /max(?:Output|Bytes|Results|Items)|MAX_OUTPUT|slice\s*\(|clamp\s*\(|truncate|limit/i.test(source)
    if (!bounded) findings.push({ plugin: item.name, kind: 'no obvious output bound in source', severity: scoped.has(item.name) ? 'error' : 'review' })
  }
  return findings
}

function run(command, cwd) {
  const result = spawnSync(command[0], command.slice(1), { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return { ok: result.status === 0, output: (result.stdout ?? '') + (result.stderr ?? ''), status: result.status ?? 1 }
}

function runMatrixChecks(inventory) {
  const rows = []
  for (const item of inventory) {
    const cwd = path.join(root, item.name)
    const row = { plugin: item.name, version: item.version, typecheck: false, build: false, pack: false, outputs: [] }
    for (const script of ['typecheck', 'build']) {
      if (!item.scripts[script]) { row.outputs.push(script + ': missing script'); continue }
      const result = run(['npm', 'run', script], cwd)
      row[script] = result.ok
      if (!result.ok) row.outputs.push(script + ': ' + result.output.slice(-1200))
    }
    const pack = run(['npm', 'pack', '--dry-run'], cwd)
    row.pack = pack.ok
    if (!pack.ok) row.outputs.push('pack: ' + pack.output.slice(-1200))
    rows.push(row)
    console.log(`${row.plugin}@${row.version} typecheck=${row.typecheck ? 'ok' : 'FAIL'} build=${row.build ? 'ok' : 'FAIL'} pack=${row.pack ? 'ok' : 'FAIL'}`)
  }
  return rows
}

const inventory = packageInventory()
const credentials = scanCredentials(inventory)
const endpoints = scanEndpoints(inventory)
const outputLimits = scanOutputLimits(inventory)
writeJson('plugin-versions.json', { generatedAt: new Date().toISOString(), plugins: inventory.map(({ name, packageName, version, path: pluginPath }) => ({ name, packageName, version, path: pluginPath })) })
writeJson('tool-manifest.json', { generatedAt: new Date().toISOString(), totalPlugins: inventory.length, totalTools: inventory.reduce((sum, item) => sum + item.tools.length, 0), plugins: inventory.map(({ name, packageName, version, path: pluginPath, tools }) => ({ name, packageName, version, path: pluginPath, tools })) })
writeJson('security-report.json', { generatedAt: new Date().toISOString(), credentials, endpoints, outputLimits })

console.log(`Inventory: ${inventory.length} plugins, ${inventory.reduce((sum, item) => sum + item.tools.length, 0)} declared tools`)
console.log(`Security: credentials=${credentials.length} endpointAllowlist=${endpoints.length} outputReview=${outputLimits.length}`)
if (credentials.length || endpoints.length || outputLimits.some(item => item.severity === 'error')) process.exitCode = 1

if (runMatrix) {
  const matrix = runMatrixChecks(inventory)
  writeJson('release-matrix.json', { generatedAt: new Date().toISOString(), plugins: matrix })
  if (matrix.some(row => !row.typecheck || !row.build || !row.pack)) process.exitCode = 1
}

if (strictOutput && outputLimits.length) process.exitCode = 1
