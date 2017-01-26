import printit from 'printit'

import RemoteCozy from './cozy'

const log = printit({
  prefix: 'Remote ',
  date: true
})

export default class Remote {
  constructor (config) {
    let deviceName = config.getDefaultDeviceName()
    let device = config.getDevice(deviceName)

    this.cozy = new RemoteCozy(device.url)
  }

  start () {
    let seq = 0

    setInterval(() => {
      this.cozy.changes(seq)
        .then(changes => {
          if (changes.results.length !== 0) {
            log.info(changes.results)
            seq = changes.last_seq
          }
        })
        .catch(err => log.error(err))
    }, 2000)
  }
}
