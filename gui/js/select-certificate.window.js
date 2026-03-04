/* @flow */

const { enable: enableRemoteModule } = require('@electron/remote/main')

const WindowManager = require('./window_manager')

/*::
import { app } from 'electron'

type ClientCertificate = {
  issuerName: String,
  subjectName: String,
  serialNumber: String,
}
*/

module.exports = class SelectCertificateWM extends WindowManager {
  /*::
  siteUrl: string
  certificates: Array<ClientCertificate>
  */

  windowOptions() {
    return {
      title: 'SELECT CERTIFICATE',
      width: 600,
      height: 500,
      show: false // XXX: required to enable remote module before rendering
    }
  }

  constructor(
    siteUrl /*: string */,
    certificates /*: Array<ClientCertificate> */
  ) {
    super()

    this.siteUrl = siteUrl
    this.certificates = certificates
  }

  async create() {
    await super.create()

    enableRemoteModule(this.win.webContents)

    this.log.debug('sending client certificates to window', {
      siteUrl: this.siteUrl,
      certificates: this.certificates
    })
    const data = {
      siteUrl: this.siteUrl,
      certificates: this.certificates.map(
        ({ issuerName, subjectName, serialNumber }) => ({
          issuerName,
          subjectName,
          serialNumber
        })
      )
    }
    this.win.webContents.send('load-client-certificates', data)

    // TODO: Add fallback certificate selection in case the window is closed by
    // the user.
    // This may require to transform this window into a "dialog", with a return
    // value.
  }

  hash() {
    return '#select-certificate'
  }

  ipcEvents() {
    return {
      'selected-client-certificate': () => {
        this.hide()
      }
    }
  }
}
