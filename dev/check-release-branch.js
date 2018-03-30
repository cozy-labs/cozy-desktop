const { execSync } = require('child_process')

execSync('git fetch')

const encoding = 'utf8'
const localRev = execSync('git rev-parse HEAD', {encoding}).trim()
const latestMasterRev = execSync('git rev-parse origin/master', {encoding}).trim()

if (localRev !== latestMasterRev) {
  throw new Error(`Local rev (${localRev}) doesn't match latest master (${latestMasterRev})`)
}

const localChanges = execSync('git status --porcelain', {encoding})
if (localChanges.trim() !== '') {
  throw new Error(`You have local changes:\n${localChanges}`)
}
