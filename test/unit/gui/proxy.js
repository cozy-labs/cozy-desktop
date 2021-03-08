/* eslint-env mocha */

const { app, session } = require('electron')
const faker = require('faker')
const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const process = require('process')
const should = require('should')
const { URL } = require('url')

const cozyHelpers = require('../../support/helpers/cozy')

const proxy = require('../../../gui/js/proxy')

describe('gui/js/proxy', function() {
  const emptyConfig = {
    'login-by-realm': undefined,
    'proxy-bypassrules': undefined,
    'proxy-ntlm-domains': '*',
    'proxy-rules': undefined,
    'proxy-script': undefined
  }

  before('reset global proxy', async () => {
    // We'll play with the proxy in these tests so we disable the global test
    // proxy in the meantime.
    await cozyHelpers.resetGlobalProxy()
  })
  after('setup global proxy again', async () => {
    // Other test files will benefit from it so we setup the gloabal test proxy
    // again.
    await cozyHelpers.setupGlobalProxy()
  })

  describe('.config()', () => {
    let config

    it('is equivalent to .config(process.argv)', () => {
      should(proxy.config()).deepEqual(proxy.config(process.argv))
    })

    describe('with no command-line option', () => {
      beforeEach(() => {
        config = proxy.config([])
      })

      it('is empty', () => {
        should(config).have.properties(emptyConfig)
      })
    })
  })

  describe('.setup()', () => {
    this.timeout(5000)
    const userAgent = faker.internet.userAgent()
    const hostname = '127.0.0.1'
    const httpPort = 7890
    const httpsPort = httpPort + 1
    const httpUrl = path =>
      new URL(path || '/', `http://${hostname}:${httpPort}`).toString()
    const pfx = fs.readFileSync(path.join(__dirname, 'cert.pfx'))

    let httpServer
    let httpsServer
    let received
    let proxySideEffects

    before('start HTTP server', () => {
      httpServer = http.createServer((req, res) => {
        received = req
        res.end()
      })
      httpServer.listen(httpPort)
    })

    after('stop HTTP server', done => {
      httpServer.close(done)
    })

    before('start HTTPS server', () => {
      const options = {
        pfx,
        passphrase: 'cozy'
      }
      httpsServer = https.createServer(options, (req, res) => {
        received = req
        res.end()
      })
      httpsServer.listen(httpsPort)
    })

    after('stop HTTPS server', done => {
      httpsServer.close(done)
    })

    beforeEach('reset received request', () => {
      received = null
    })

    const proxySetupHook = config => async () => {
      proxySideEffects = await proxy.setup(app, config, userAgent)
    }
    const revertProxySideEffects = async () => {
      await proxy.reset(app, session, proxySideEffects)
    }

    afterEach(revertProxySideEffects)

    describe('with no config', () => {
      beforeEach(proxySetupHook(emptyConfig))

      describe('revertProxySideEffects()', () => {
        beforeEach(revertProxySideEffects)
        beforeEach(() => global.fetch(httpUrl()))

        it('reverts User-Agent', async () => {
          should(received.headers['user-agent']).not.equal(userAgent)
        })
      })

      describe('fetch()', () => {
        describe('HTTP', () => {
          beforeEach(() => global.fetch(httpUrl()))

          it('sets User-Agent', async () => {
            should(received.headers['user-agent']).equal(userAgent)
          })
        })

        // TODO: fetch + self-signed pfx
      })

      describe('http.request()', () => {
        const options = {
          hostname,
          port: httpPort,
          path: '/',
          method: 'GET'
        }

        beforeEach('do request', done => {
          const req = http.request(options, () => {
            done()
          })
          req.on('error', done)
          req.end()
        })

        it('sets User-Agent', async () => {
          should(received.headers['user-agent']).equal(userAgent)
        })
      })

      describe('https.request()', () => {
        const options = {
          hostname,
          port: httpsPort,
          path: '/',
          method: 'GET',
          rejectUnauthorized: false // self-signed pfx
        }

        beforeEach(done => {
          const req = https.request(options, () => {
            done()
          })
          req.on('error', done)
          req.end()
        })

        it('sets User-Agent', () => {
          should(received.headers['user-agent']).equal(userAgent)
        })
      })
    })

    // TODO: Test various proxy configs
  })
})
