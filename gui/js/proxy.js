/** Proxy management.
 *
 * @module gui/js/proxy
 * @flow
 */

const ElectronProxyAgent = require('electron-proxy-agent')
const url = require('url')
const http = require('http')
const https = require('https')
const yargs = require('yargs')

const log = require('../../core/app').logger({
  component: 'GUI:proxy'
})

/*::
import { App, Session } from 'electron'
*/

const SESSION_PARTITION_NAME = 'persist:sync'

const config = (argv /*: Array<*> */ = process.argv) => {
  const config = yargs
    .env('COZY_DRIVE')
    .conflicts('proxy-script', 'proxy-rules')
    .describe('proxy-script', 'The URL associated with the PAC file.')
    .describe('proxy-rules', 'Rules indicating which proxies to use.')
    .describe(
      'proxy-bypassrules',
      'Rules indicating which URLs should bypass the proxy settings. ' +
        'See https://github.com/electron/electron/blob/master/docs/api/session.md#sessetproxyconfig-callback'
    )
    .default('proxy-ntlm-domains', '*')
    .describe(
      'proxy-ntlm-domains',
      'A comma-separated list of servers for which integrated authentication is enabled. ' +
        'Dynamically sets whether to always send credentials for HTTP NTLM or Negotiate authentication.'
    )
    .describe('login-by-realm', 'comma-separated list of realm:user:password')
    .help('help')
    .parse(argv)

  log.debug({ config }, 'argv')
  return config
}

const formatCertificate = certif =>
  `Certificate(${certif.issuerName} ${certif.subjectName})`

const setup = async (
  app /*: App */,
  config /*: Object */,
  session /*: Session */,
  userAgent /*: string */
) => {
  const syncSession = session.fromPartition(SESSION_PARTITION_NAME, {
    cache: false
  })

  const loginByRealm = {}
  if (config['login-by-realm']) {
    config['login-by-realm'].split(',').forEach(lbr => {
      const [realm, username, ...password] = lbr.split(':')
      loginByRealm[realm] = [username, password.join(':')]
    })
  }

  if (config['proxy-ntlm-domains']) {
    syncSession.allowNTLMCredentialsForDomains(config['proxy-ntlm-domains'])
  }

  syncSession.setCertificateVerifyProc((request, callback) => {
    const { hostname, certificate, verificationResult, errorCode } = request
    if (verificationResult < 0) {
      log.warn(
        {
          hostname,
          certificate: formatCertificate(certificate),
          verificationResult,
          errorCode
        },
        'Certificate Verification Error'
      )
    }
    callback(-3) // use chrome validation
  })

  // It's unclear if this actually works or not especially since we can't
  // control that the Cache-Control header is really set.
  // See https://github.com/electron/electron/issues/27895.
  syncSession.webRequest.onHeadersReceived(
    ({ statusLine, responseHeaders }, callback) => {
      responseHeaders['Cache-Control'] = ['no-store']
      statusLine += ' NO CACHE'
      callback({ responseHeaders, statusLine })
    }
  )

  app.on(
    'select-client-certificate',
    (event, webContents, url, list, callback) => {
      log.debug({ url }, 'select-client-certificate')
      callback()
    }
  )

  app.on(
    'certificate-error',
    (event, webContents, url, error, certificate, callback) => {
      log.warn(
        { url, error, certificate: formatCertificate(certificate) },
        'App Certificate Error'
      )
      callback(false)
    }
  )

  app.on('login', (event, webContents, request, authInfo, callback) => {
    log.debug({ request: request.method + ' ' + request.url }, 'Login event')
    const auth = loginByRealm[authInfo.realm]
    if (auth) {
      event.preventDefault()
      callback(...auth)
    } else {
      callback()
    }
  })

  // XXX even if we swicth from electron-fetch, keep the custom user-agent
  const originalFetch = global.fetch
  const electronFetch = require('electron-fetch').default
  global.fetch = (url, opts = {}) => {
    opts.session = syncSession
    opts.headers = opts.headers || {}
    opts.headers['User-Agent'] = userAgent
    opts.useSessionCookies = true // Send cookies stored in Electron's Session
    return electronFetch(url, opts)
  }

  // $FlowFixMe
  http.Agent.globalAgent = http.globalAgent = https.globalAgent = new ElectronProxyAgent(
    syncSession
  )

  const parseRequestOptions = (options /* * */) => {
    if (typeof options === 'string') {
      const {
        hash,
        host,
        hostname,
        href,
        origin,
        password,
        pathname,
        port,
        protocol,
        search,
        searchParams,
        username
      } = new url.URL(options)
      options = {
        agent: http.globalAgent,
        hash,
        headers: {},
        host,
        hostname,
        href,
        origin,
        password,
        pathname,
        port,
        protocol,
        search,
        searchParams,
        username
      }
    } else {
      options = Object.assign({}, options)
    }
    options.agent = options.agent || http.globalAgent
    options.headers = options.headers || {}
    // ElectronProxyAgent removes the `host` header and uses `hostname` instead.
    // However, we need this header so we set it back before sending the
    // request.
    // See https://github.com/felicienfrancois/node-electron-proxy-agent/blob/f6757f10c50c8dfcd5dc4ad9943aaf55e3788e0c/index.js#L93
    if (options.hostname) options.headers.host = options.hostname
    options.headers['User-Agent'] = userAgent
    return options
  }

  const originalHttpRequest = http.request
  // $FlowFixMe
  http.request = function(options, cb) {
    return originalHttpRequest.call(http, parseRequestOptions(options), cb)
  }
  const originalHttpsRequest = https.request
  // $FlowFixMe
  https.request = function(options, cb) {
    return originalHttpsRequest.call(https, parseRequestOptions(options), cb)
  }

  if (config['proxy-script'] || config['proxy-rules']) {
    await syncSession.setProxy({
      pacScript: config['proxy-script'],
      proxyRules: config['proxy-rules'],
      proxyBypassRules: config['proxy-bypassrules']
    })
  }

  return {
    originalFetch,
    originalHttpRequest,
    originalHttpsRequest
  }
}

const reset = async (
  app /*: App */,
  session /*: Session */,
  {
    originalFetch,
    originalHttpRequest,
    originalHttpsRequest
  } /*: { originalFetch: Function, originalHttpRequest: Function, originalHttpsRequest: Function } */
) => {
  global.fetch = originalFetch
  // $FlowFixMe
  http.Agent.globalAgent = http.globalAgent = new http.Agent()
  // $FlowFixMe
  http.request = originalHttpRequest
  // $FlowFixMe
  https.Agent.globalAgent = https.globalAgent = new https.Agent()
  // $FlowFixMe
  https.request = originalHttpsRequest

  for (const event of [
    'select-client-certificate',
    'certificate-error',
    'login'
  ]) {
    app.removeAllListeners(event)
  }

  const syncSession = session.fromPartition(SESSION_PARTITION_NAME)
  syncSession.setCertificateVerifyProc(null)
  syncSession.allowNTLMCredentialsForDomains('')
  await syncSession.setProxy({})
}

module.exports = {
  SESSION_PARTITION_NAME,
  config,
  setup,
  reset
}
