const cozy = require('cozy-client-js')
const fs = require('fs')

const pkg = require('../../package.json')
const automatedRegistration = require('./automated_registration')

const cozyUrl = process.env.COZY_URL
const passphrase = process.env.COZY_PASSPHRASE
const storage = new cozy.MemoryStorage()

function readAccessToken () {
  console.log('Read access token...')
  return storage.load('creds')
    .then(creds => creds.token.accessToken)
}

function generateTestEnv (accessToken) {
  console.log('Generate .env.test file...')
  fs.writeFileSync('.env.test', `
COZY_DESKTOP_HEARTBEAT=1000
COZY_STACK_TOKEN=${accessToken}
NODE_ENV=test
  `)
}

automatedRegistration(cozyUrl, passphrase, storage)
  .process(pkg)
  .then(readAccessToken)
  .then(generateTestEnv)
  .catch(console.error)
