/** Registration of the client to the remote Cozy.
 *
 * @module core/remote/registration
 * @flow
 */

const http = require('http')
const os = require('os')
const url = require('url')

const autoBind = require('auto-bind')
const open = require('open')

const { createClient, loginAndSaveClient, registerClient } = require('./client')

const PORT_NUMBER = 3344

/*::
import type { Config } from '../config'
import type { OAuthClient } from './client'
*/

module.exports = class Registration {
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
              'Cozy-desktop has been successfully registered as a Cozy device'
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
      deviceName = `Cozy Drive (${os.hostname()})`
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
    } catch {
      this.config.clear()
    }
  }
}
