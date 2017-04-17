#!/usr/bin/env babel-node

import { execSync } from 'child_process'

execSync('git fetch')

const encoding = 'utf8'
const localRev = execSync('git rev-parse HEAD', {encoding}).trim()
const latestMasterRev = execSync('git rev-parse origin/master', {encoding}).trim()

if (localRev !== latestMasterRev) {
  console.error(`Local rev (${localRev}) doesn't match latest master (${latestMasterRev})`)
  process.exit(1)
}

const localChanges = execSync('git status --porcelain', {encoding})
if (localChanges.trim() !== '') {
  console.error(`You have local changes:\n${localChanges}`)
  process.exit(1)
}
