const { app, session } = require('electron')
const faker = require('faker')
const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const process = require('process')
const should = require('should')
const { URL } = require('url')

const proxy = require('../../../gui/js/proxy')

describe('gui/js/proxy', function() {
  const emptyConfig = {
    'login-by-realm': undefined,
    'proxy-bypassrules': undefined,
    'proxy-ntlm-domains': '*',
    'proxy-rules': undefined,
    'proxy-script': undefined
  }

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

    beforeEach('start HTTP server', () => {
      httpServer = http.createServer((req, res) => {
        received = req
        res.end()
      })
      httpServer.listen(httpPort)
    })

    afterEach('stop HTTP server', done => {
      httpServer.close(done)
    })

    beforeEach('start HTTPS server', () => {
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

    afterEach('stop HTTPS server', done => {
      httpsServer.close(done)
    })

    const proxySetupHook = config => done => {
      proxy.setup(app, config, session, userAgent, sideEffects => {
        proxySideEffects = sideEffects
        done()
      })
    }
    const revertProxySideEffects = done => {
      global.fetch = proxySideEffects.originalFetch
      http.Agent.globalAgent = http.globalAgent = new http.Agent()
      http.request = proxySideEffects.originalHttpRequest
      https.Agent.globalAgent = https.globalAgent = new https.Agent()
      https.request = proxySideEffects.originalHttpsRequest
      for (const event of [
        'select-client-certificate',
        'certificate-error',
        'login'
      ]) {
        app.removeAllListeners(event)
      }
      session.defaultSession.setCertificateVerifyProc(null)
      session.defaultSession.allowNTLMCredentialsForDomains('')
      session.defaultSession.setProxy({}, done)
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
