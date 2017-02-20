import os from 'os'
import http from 'http'
import opn from 'opn'

import { Client as CozyClient } from 'cozy-client-js'

const PORT_NUMBER = 3344

export default class Registration {
  constructor (url, config) {
    this.url = url
    this.config = config
  }

  onRegistered (client, url) {
    // TODO if the port is already taken, try again with a new port
    let server
    return new Promise((resolve) => {
      server = http.createServer((request, response) => {
        if (request.url.indexOf('/callback') === 0) {
          resolve(request.url)
          response.end('Cozy-desktop has been successfully registered as a Cozy device')
        }
      })
      server.listen(PORT_NUMBER, () => {
        console.log('Please visit the following url to authorize the application: ', url)
        opn(url)
      })
    })
      .then(
        (url) => { server.close(); return url },
        (err) => { server.close(); throw err }
      )
  }

  clientParams (pkg, deviceName) {
    if (!deviceName) {
      // TODO make it unique
      deviceName = os.hostname() || pkg.name || 'desktop'
    }
    let softwareID = (pkg.repository || 'cozy-desktop')
    softwareID = softwareID.replace('https://', '')
    softwareID = softwareID.replace('git://', '')
    softwareID = softwareID.replace('.git', '')
    return {
      redirectURI: `http://localhost:${PORT_NUMBER}/callback`,
      softwareID: softwareID,
      softwareVersion: pkg.version || 'unknown',
      clientName: deviceName,
      clientKind: 'desktop',
      clientURI: pkg.homepage,
      logoURI: pkg.logo,
      scopes: ['io.cozy.files']
    }
  }

  process (pkg, deviceName) {
    const params = this.clientParams(pkg, deviceName)
    const cozy = new CozyClient({
      cozyURL: this.url,
      oauth: {
        storage: this.config,
        clientParams: params,
        onRegistered: this.onRegistered
      }
    })
    return cozy.authorize()
  }
}
