/** Network configuration.
 *
 * @module gui/js/network
 * @flow
 */

const dns = require('dns')
const http = require('http')
const https = require('https')
const yargs = require('yargs')
const electronFetch = require('electron-fetch').default
const { app } = require('electron')

const logger = require('../../../core/utils/logger')
const { ProxyAgent, getProxyForUrl } = require('./agent')

/*::
import { App, Session } from 'electron'

type NetworkConfig = {
  'proxy-script': ?string,
  'proxy-rules': ?string,
  'proxy-bypassrules': ?string,
  'proxy-ntlm-domains': string,
  'login-by-realm': ?string,
  'resolve-ipv4-first': boolean
}
*/

const log = logger({
  component: 'GUI:network'
})

const SESSION_PARTITION_NAME = 'persist:sync'

const networkConfig = (argv /*: Array<*> */ = process.argv) => {
  const networkConfig = yargs
    .env('COZY_DRIVE')
    .conflicts('proxy-script', 'proxy-rules')
    .option('proxy-script', {
      describe: 'The URL associated with the PAC file.',
      type: 'string',
      default: undefined
    })
    .option('proxy-rules', {
      describe: 'Rules indicating which proxies to use.',
      type: 'string',
      default: undefined
    })
    .option('proxy-bypassrules', {
      describe:
        'Rules indicating which URLs should bypass the proxy settings. ' +
        'See https://github.com/electron/electron/blob/master/docs/api/session.md#sessetproxyconfig-callback',
      type: 'string',
      default: undefined
    })
    .option('proxy-ntlm-domains', {
      describe:
        'A comma-separated list of servers for which integrated authentication is enabled. ' +
        'Dynamically sets whether to always send credentials for HTTP NTLM or Negotiate authentication.',
      default: '*'
    })
    .option('login-by-realm', {
      describe: 'comma-separated list of realm:user:password',
      type: 'string',
      default: undefined
    })
    .option('resolve-ipv4-first', {
      describe:
        'Prioritize IPv4 results from the DNS resolver over IPv6 results',
      type: 'boolean',
      default: true
    })
    .help('help')
    .parse(argv)

  log.debug({ networkConfig }, 'argv')
  return networkConfig
}

const formatCertificate = certif =>
  `Certificate(${certif.issuerName} ${certif.subjectName})`

const getSession = (
  session /*: Session */,
  userAgent /*: string */
) /*: Session */ => {
  const syncSession = session.fromPartition(SESSION_PARTITION_NAME, {
    cache: false
  })
  syncSession.setUserAgent(userAgent)

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

  return syncSession
}

/* Can be tested using `mitmproxy` in the following way:
 *
 * Start the proxy with `mitmproxy -k -p 8888`
 *
 * Start the app with `INSECURE_SSL=1` and the `--proxy-rules="localhost:8888"` argument.
 */
const setupProxy = async (
  electronApp /*: App */,
  networkConfig /*: Object */,
  session /*: Session */
) => {
  const loginByRealm = {}
  if (networkConfig['login-by-realm']) {
    networkConfig['login-by-realm'].split(',').forEach(lbr => {
      const [realm, username, ...password] = lbr.split(':')
      loginByRealm[realm] = [username, password.join(':')]
    })
  }

  if (networkConfig['proxy-ntlm-domains']) {
    session.allowNTLMCredentialsForDomains(networkConfig['proxy-ntlm-domains'])
  }

  if (networkConfig['proxy-script'] || networkConfig['proxy-rules']) {
    await session.setProxy({
      pacScript: networkConfig['proxy-script'],
      proxyRules: networkConfig['proxy-rules'],
      proxyBypassRules: networkConfig['proxy-bypassrules']
    })
  }

  const agentOptions = {
    getProxyForUrl: getProxyForUrl(session),
    keepAlive: true
  }

  const httpAgent = new ProxyAgent({
    ...agentOptions,
    protocol: 'http:'
  })
  // $FlowFixMe
  http.Agent.globalAgent = http.globalAgent = httpAgent

  const httpsAgent = new ProxyAgent({
    ...agentOptions,
    protocol: 'https:',
    ...(app.commandLine.hasSwitch('ignore-certificate-errors')
      ? {
          rejectUnauthorized: false // XXX: Danger! For debugging purposes only
        }
      : {}) // XXX: we need the key not to be present for our unit tests to pass
  })
  // $FlowFixMe
  https.globalAgent = httpsAgent

  electronApp.on('login', (event, webContents, request, authInfo, callback) => {
    log.debug({ request: request.method + ' ' + request.url }, 'Login event')
    const auth = loginByRealm[authInfo.realm]
    if (auth) {
      event.preventDefault()
      callback(...auth)
    } else {
      callback()
    }
  })

  // Debug certificate errors
  electronApp.on(
    'select-client-certificate',
    (event, webContents, url, list, callback) => {
      log.debug({ url }, 'select-client-certificate')
      callback()
    }
  )

  electronApp.on(
    'certificate-error',
    (event, webContents, url, error, certificate, callback) => {
      log.error(
        { url, error, certificate: formatCertificate(certificate) },
        'App Certificate Error'
      )
      callback(false)
    }
  )
}

const requestOptions = (
  userAgent /*: string */,
  options /*: { agent?: http.Agent, headers?: { [key: string]: mixed }, hostname?: string } */ = {}
) => {
  const { headers = {} } = options

  // XXX: electronFetch does not use the session's User-Agent so we have to
  // pass it explicitely in the request's options.
  headers['User-Agent'] = userAgent

  return {
    ...options,
    headers
  }
}

const setup = async (
  electronApp /*: App */,
  networkConfig /*: Object */,
  session /*: Session */,
  userAgent /*: string */
) => {
  if (networkConfig['resolve-ipv4-first']) {
    // $FlowFixMe this method exists in Node but is not defined in Flow...
    dns.setDefaultResultOrder('ipv4first')
  }

  const syncSession = getSession(session, userAgent)

  await setupProxy(electronApp, networkConfig, syncSession)

  const originalFetch = global.fetch
  global.fetch = (url, opts = {}) => {
    return electronFetch(
      url,
      requestOptions(userAgent, {
        ...opts,
        session: syncSession,
        useSessionCookies: true
      })
    )
  }

  const originalHttpRequest = http.request
  // $FlowFixMe
  http.request = (options = {}, callback) => {
    return originalHttpRequest.call(
      http,
      requestOptions(userAgent, options),
      callback
    )
  }
  const originalHttpsRequest = https.request
  // $FlowFixMe
  https.request = (options = {}, callback) => {
    return originalHttpsRequest.call(
      https,
      requestOptions(userAgent, options),
      callback
    )
  }

  return {
    argv: networkConfig['_'],
    originalFetch,
    originalHttpRequest,
    originalHttpsRequest
  }
}

const reset = async (
  electronApp /*: App */,
  session /*: Session */,
  {
    originalFetch,
    originalHttpRequest,
    originalHttpsRequest
  } /*: { originalFetch: Function, originalHttpRequest: Function, originalHttpsRequest: Function } */
) => {
  global.fetch = originalFetch
  // $FlowFixMe
  http.request = originalHttpRequest
  // $FlowFixMe
  https.request = originalHttpsRequest

  // $FlowFixMe
  http.Agent.globalAgent = http.globalAgent = new http.Agent({})
  // $FlowFixMe
  https.globalAgent = new https.Agent({})

  for (const event of [
    'select-client-certificate',
    'certificate-error',
    'login'
  ]) {
    electronApp.removeAllListeners(event)
  }

  const syncSession = session.fromPartition(SESSION_PARTITION_NAME)
  syncSession.setCertificateVerifyProc(null)
  syncSession.allowNTLMCredentialsForDomains('')
  await syncSession.setProxy({})
}

module.exports = {
  SESSION_PARTITION_NAME,
  config: networkConfig,
  setup,
  reset
}
