/** Registration of the client to the remote Cozy.
 *
 * @module core/remote/registration
 */

const autoBind = require('auto-bind')
const os = require('os')
const http = require('http')
const opn = require('opn')

const CozyClient = require('cozy-client-js').Client

const PORT_NUMBER = 3344

module.exports = class Registration {
  constructor(url, config, onReady = null) {
    this.url = url
    this.config = config
    this.onReady =
      onReady ||
      (url => {
        // eslint-disable-next-line no-console
        console.log(
          'Please visit the following url to authorize the application: ',
          url
        )
        opn(url)
      })

    autoBind(this)
  }

  onRegistered(client, url) {
    // TODO if the port is already taken, try again with a new port
    let server
    return new Promise((resolve, reject) => {
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
    }).then(
      url => {
        server.close()
        return url
      },
      err => {
        server.close()
        throw err
      }
    )
  }

  clientParams(pkg, redirectURI, deviceName) {
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
      policyURI: 'https://files.cozycloud.cc/cgu.pdf',
      scopes: [
        // TODO: Implement existing config update in case we change permissions
        'io.cozy.files',
        'io.cozy.settings:GET:io.cozy.settings.disk-usage',
        'io.cozy.jobs:POST:sendmail:worker'
      ]
    }
  }

  process(pkg, redirectURI, onRegistered, deviceName) {
    const params = this.clientParams(pkg, redirectURI, deviceName)
    onRegistered = onRegistered || this.onRegistered
    const cozy = new CozyClient({
      cozyURL: this.url,
      oauth: {
        storage: this.config,
        clientParams: params,
        onRegistered: onRegistered
      }
    })
    return cozy.authorize()
  }
}
