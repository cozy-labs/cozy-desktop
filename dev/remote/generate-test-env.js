require('../../core/globals')
const { app, session } = require('electron')
const fse = require('fs-extra')

const cozy = require('cozy-client-js')

const automatedRegistration = require('./automated_registration')
const network = require('../../gui/js/network')
const pkg = require('../../package.json')

const cozyUrl =
  chooseCozyUrl(process.env.BUILD_JOB) ||
  process.env.COZY_URL ||
  'http://cozy.localhost:8080'
const passphrase = process.env.COZY_PASSPHRASE || 'cozy'
const storage = new cozy.MemoryStorage()

function chooseCozyUrl(buildJob) {
  return buildJob === 'scenarios'
    ? process.env.COZY_URL_2
    : process.env.COZY_URL_1
}

function readAccessToken() {
  // eslint-disable-next-line no-console
  console.log('Read access token...')
  return storage.load('creds').then(creds => creds.token.accessToken)
}

function generateTestEnv(accessToken) {
  // eslint-disable-next-line no-console
  console.log('Generate .env.test file...')
  return fse.writeFile(
    '.env.test',
    `
COZY_DESKTOP_HEARTBEAT=1000
COZY_STACK_TOKEN=${accessToken}
COZY_URL=${cozyUrl}
NODE_ENV=test
  `
  )
}

app
  .whenReady()
  .then(() => {
    const syncSession = session.fromPartition(network.SESSION_PARTITION_NAME, {
      cache: false
    })
    // Prevent login errors in case we run bootstrap twice by removing the
    // session cookie which would trigger a redirect from the login page.
    return syncSession.clearStorageData()
  })
  .then(() => network.setup(app, {}, session, ''))
  .then(() => automatedRegistration(cozyUrl, passphrase, storage).process(pkg))
  .then(readAccessToken)
  .then(generateTestEnv)
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('Remote bootstrap complete.')
    process.exit(0) // eslint-disable-line no-process-exit
    return
  })
  .catch(err => {
    // eslint-disable-next-line no-console
    console.error(err)
    process.exit(1) // eslint-disable-line no-process-exit
  })
