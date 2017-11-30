/* eslint standard/no-callback-literal: 0 */

const ElectronProxyAgent = require('electron-proxy-agent')
const url = require('url')
const http = require('http')
const https = require('https')

const log = require('cozy-desktop').default.logger({
  component: 'GUI:proxy'
})

const config = require('yargs')
  .env('COZY_DRIVE')
  .conflicts('proxy-script', 'proxy-rules')
  .describe('proxy-script', 'The URL associated with the PAC file.')
  .describe('proxy-rules', 'Rules indicating which proxies to use.')
  .describe('proxy-bypassrules', 'Rules indicating which URLs should bypass the proxy settings. ' +
                                 'See https://github.com/electron/electron/blob/master/docs/api/session.md#sessetproxyconfig-callback')
  .default('proxy-ntlm-domains', '*')
  .describe('proxy-ntlm-domains', 'A comma-separated list of servers for which integrated authentication is enabled. ' +
                                  'Dynamically sets whether to always send credentials for HTTP NTLM or Negotiate authentication.')
  .describe('login-by-realm', 'comma-separated list of realm:user:password')
  .help('help')
  .parse()

log.debug({config}, 'argv')

const formatCertificate = (certif) => `Certificate(${certif.issuerName} ${certif.subjectName})`

module.exports = (app, session, doneSetup) => {
  const loginByRealm = {}
  if (config['login-by-realm']) {
    config['login-by-realm'].split(',').forEach((lbr) => {
      const [realm, username, ...password] = lbr.split(':')
      loginByRealm[realm] = [username, password.join(':')]
    })
  }

  if (config['proxy-ntlm-domains']) {
    session.defaultSession.allowNTLMCredentialsForDomains(config['proxy-ntlm-domains'])
  }

  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    const {hostname, certificate, verificationResult, errorCode} = request
    if (verificationResult < 0) {
      log.warn({hostname, certificate: formatCertificate(certificate), verificationResult, errorCode}, 'Certificate Verification Error')
    } else {
      log.debug({hostname, certificate: formatCertificate(certificate), verificationResult, errorCode}, 'Certificate Validated')
    }
    callback(-3) // use chrome validation
  })

  app.on('select-client-certificate', (event, webContents, url, list, callback) => {
    log.debug({url}, 'select-client-certificate')
    callback()
  })

  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    log.warn({url, error, certificate: formatCertificate(certificate)}, 'App Certificate Error')
    callback(false)
  })

  app.on('login', (event, webContents, request, authInfo, callback) => {
    log.debug({request: request.method + ' ' + request.url, authInfo}, 'Login event')
    const auth = loginByRealm[authInfo.realm]
    if (auth) {
      event.preventDefault()
      callback(...auth)
    } else {
      callback()
    }
  })

  const electronFetch = require('electron-fetch')
  global.fetch = (url, opts = {}) => {
    opts.session = session.defaultSession
    return electronFetch(url, opts)
  }
  http.Agent.globalAgent = http.globalAgent = https.globalAgent = new ElectronProxyAgent(session.defaultSession)
  const _httpRequest = http.request
  http.request = function (options, cb) {
    log.warn(options, 'USING RAW HTTP REQUEST')
    options.agent = options.agent || http.globalAgent
    options.headers = options.headers || {}
    options.headers.host = options.hostname
    return _httpRequest.call(http, options, cb)
  }
  const _httpsRequest = https.request
  https.request = function (options, cb) {
    log.warn(options, 'USING RAW HTTPS REQUEST')
    if (typeof options === 'string') {
      options = url.parse(options)
    } else {
      options = Object.assign({}, options)
    }
    options.agent = options.agent || https.globalAgent
    return _httpsRequest.call(https, options, cb)
  }

  if (config['proxy-script'] || config['proxy-rules']) {
    session.defaultSession.setProxy({
      pacScript: config['proxy-script'],
      proxyRules: config['proxy-rules'],
      proxyBypassRules: config['proxy-bypassrules']
    }, doneSetup)
  } else doneSetup()
}
