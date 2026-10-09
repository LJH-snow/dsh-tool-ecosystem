#!/usr/bin/env node
import fs from 'node:fs'

const matrixPath = 'release/release-matrix.json'
if (!fs.existsSync(matrixPath)) {
  console.log('release/release-matrix.json was not generated')
  process.exit(0)
}

const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'))
const rows = Array.isArray(matrix.plugins) ? matrix.plugins : []
const passed = rows.filter(row => row.typecheck && row.build && row.pack).length

console.log('## release-check')
console.log('')
console.log('- Plugins: ' + rows.length)
console.log('- Passed: ' + passed)
console.log('- Failed: ' + (rows.length - passed))
console.log('')
console.log('| Plugin | Typecheck | Build | Pack |')
console.log('| --- | --- | --- | --- |')
for (const row of rows) {
  console.log('| ' + row.plugin + ' | ' + (row.typecheck ? '✅' : '❌') + ' | ' + (row.build ? '✅' : '❌') + ' | ' + (row.pack ? '✅' : '❌') + ' |')
}
