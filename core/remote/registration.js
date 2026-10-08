/** Registration of the client to the remote Cozy.
 *
 * @module core/remote/registration
 * @flow
 */

const crypto = require('crypto')
const http = require('http')
const os = require('os')
const url = require('url')

const autoBind = require('auto-bind')
const open = require('open')

const {
  createClient,
  loginAndSaveClient,
  registerClient,
  connectOIDCClient
} = require('./client')
const { logger } = require('../utils/logger')

const PORT_NUMBER = 3344
const log = logger({
  component: 'App'
})

const LOGIN_SUCCESS_PAGE =
  '<!DOCTYPE html><html><body>Login successful. You can close this tab and ' +
  'go back to the Twake Desktop application.</body></html>'
const OIDC_CALLBACK_CLOSED = 'OIDC_CALLBACK_CLOSED'

/*::
import type { Config } from '../config'
import type { OAuthClient } from './client'
*/

class Registration {
  /*::
  cozyUrl: string
  config: Config
  onReady: (string) => any
  onRegistered: ?(string) => string
  */

  constructor(
    cozyUrl /*: string */,
    config /*: Config */,
    onReady /*: ?(string) => any */ = null
  ) {
    this.cozyUrl = cozyUrl
    this.config = config
    this.onReady =
      onReady ||
      (url => {
        // eslint-disable-next-line no-console
        console.log(
          'Please visit the following url to authorize the application: ',
          url
        )
        open(url)
      })

    autoBind(this)
  }

  async defaultOnRegistered(url /*: string */) {
    let server
    try {
      // TODO if the port is already taken, try again with a new port
      const redirectURL = await new Promise((resolve, reject) => {
        server = http.createServer((request, response) => {
          if (request.url.indexOf('/callback') === 0) {
            resolve(request.url)
            response.end(
              'Twake Desktop has been successfully registered as a Twake Workplace device'
            )
          }
        })
        server.listen(PORT_NUMBER, () => {
          const pReady = this.onReady(url)
          if (pReady.catch) pReady.catch(reject)
        })
      })
      return redirectURL
    } finally {
      if (server) server.close()
    }
  }

  async openURLCallback(authorizeUrl /*: string */) {
    const onRegistered = this.onRegistered || this.defaultOnRegistered
    const redirectPath = await onRegistered(authorizeUrl)
    return new url.URL(redirectPath, this.cozyUrl).toString()
  }

  oauthClient(
    pkg /*: Object */,
    redirectURI /*: ?string */,
    deviceName /*: ?string */
  ) /*: $Shape<OAuthClient> */ {
    if (!deviceName) {
      deviceName = `Twake Desktop (${os.hostname()})`
    }
    let softwareID = pkg.repository || 'cozy-desktop'
    if (softwareID.url) {
      softwareID = softwareID.url
    }
    softwareID = softwareID.replace('https://', '')
    softwareID = softwareID.replace('git://', '')
    softwareID = softwareID.replace('.git', '')
    return {
      redirectURI: redirectURI || `http://localhost:${PORT_NUMBER}/callback`,
      softwareID: softwareID,
      softwareVersion: pkg.version || 'unknown',
      clientName: deviceName,
      clientKind: 'desktop',
      clientURI: pkg.homepage,
      logoURI: pkg.logo,
      policyURI: 'https://files.cozycloud.cc/cgu.pdf'
    }
  }

  async registerWithDelegationCode(
    pkg /*: Object */,
    code /*: string */,
    deviceName /*: ?string */,
    redirectURI /*: ?string */
  ) {
    this.config.cozyUrl = this.cozyUrl
    this.config.client = this.oauthClient(pkg, redirectURI, deviceName)

    try {
      const client = createClient(this.config)
      await connectOIDCClient(client, code)
      await loginAndSaveClient(client, this.config)
    } catch (err) {
      log.error('could not register OAuth client with delegation code', {
        err,
        code
      })

      this.config.clear()

      throw err
    }
  }

  async process(
    pkg /*: Object */,
    redirectURI /*: ?string */,
    onRegistered /*: ?(string) => string */,
    deviceName /*: ?string */
  ) {
    this.onRegistered = onRegistered // TODO: move to constructor

    try {
      this.config.cozyUrl = this.cozyUrl
      this.config.client = this.oauthClient(pkg, redirectURI, deviceName)

      const client = createClient(this.config)
      await registerClient(client, this)
      await loginAndSaveClient(client, this.config)

      return redirectURI
    } catch (err) {
      log.error('could not register OAuth client', { err })

      this.config.clear()

      throw err
    }
  }
}

/*::
export type OIDCCallbackResult = {
  callbackURL: string,
  params: Promise<URLSearchParams>,
  close: () => void
}
*/

async function waitForOIDCCallback(
  options /*: ?{ successPage: ?string } */ = {}
) /*: Promise<OIDCCallbackResult> */ {
  const successPage = (options && options.successPage) || LOGIN_SUCCESS_PAGE
  const state = crypto.randomBytes(16).toString('hex')
  const server = http.createServer()

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = (server.address() /*: any */).port
  const callbackURL = `http://127.0.0.1:${port}/callback?state=${state}`

  const params = new Promise((resolve, reject) => {
    server.on('request', (request, response) => {
      request.on('error', () => {})
      response.on('error', () => {})
      try {
        const parsed = new url.URL(request.url || '/', callbackURL)
        if (parsed.pathname !== '/callback') {
          response.statusCode = 404
          response.end()
        } else if (
          request.method === 'GET' &&
          parsed.searchParams.get('state') === state
        ) {
          resolve((parsed.searchParams /*: any */))
          response.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8'
          })
          response.end(successPage)
        } else {
          response.statusCode = 400
          response.end()
        }
      } catch (err) {
        response.statusCode = 400
        response.end()
      }
    })
    server.on('error', reject)
    server.on('close', () => {
      const err = new Error('OIDC callback server closed without a callback')
      ;(err /*: Object */).code = OIDC_CALLBACK_CLOSED
      reject(err)
    })
  })

  const close = () => {
    if (server.listening) server.close()
  }

  return { callbackURL, params, close }
}

module.exports = {
  Registration,
  waitForOIDCCallback,
  OIDC_CALLBACK_CLOSED
}
