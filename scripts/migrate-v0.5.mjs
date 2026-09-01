#!/usr/bin/env node
/**
 * One-time v0.5 migration: adopt the legacy single-board medium
 * (.dsh-home/storages/scrum.json) as the board of ONE workspace — by
 * default this repository — under the new per-workspace naming
 * (scrum_ws_<hash>.json, unit header rewritten to match).
 *
 * Run it with the server STOPPED (or restart right after), so the old
 * process cannot rewrite scrum.json behind the copy:
 *
 *   node scripts/migrate-v0.5.mjs [workspace-path]
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boardNameOf } from '../packages/scrum-domain/lib/boards.js'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspace = resolve(process.argv[2] ?? repo)
const storages = join(repo, '.dsh-home', 'storages')
const legacyPath = join(storages, 'scrum.json')

const boardName = boardNameOf(workspace)
const targetPath = join(storages, `${boardName}.json`)
const backupPath = join(storages, 'scrum.json.v0_4.bak')

if (!existsSync(legacyPath)) {
  console.error(`nada a migrar: ${legacyPath} não existe (já migrado?)`)
  process.exit(existsSync(targetPath) ? 0 : 1)
}
if (existsSync(targetPath)) {
  console.error(`recusando: ${targetPath} já existe — o quadro deste workspace já foi criado`)
  process.exit(1)
}

const document = JSON.parse(readFileSync(legacyPath, 'utf8'))
if (document?.unit?.name !== 'scrum') {
  console.error(`recusando: ${legacyPath} não carrega o cabeçalho unit "scrum"`)
  process.exit(1)
}
document.unit.name = boardName
writeFileSync(targetPath, `${JSON.stringify(document, null, 2)}\n`)
renameSync(legacyPath, backupPath)

console.log(`migrado: quadro histórico agora é o quadro de ${workspace}`)
console.log(`  novo:   ${targetPath}`)
console.log(`  backup: ${backupPath}`)
