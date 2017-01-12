import fs from 'fs-extra'
import path from 'path'
import urlParser from 'url'
let log = require('printit')({
  prefix: 'Config        ',
  date: true
})

// Config can keep some configuration parameters in a JSON file,
// like the devices credentials or the mount path
class Config {

  // Create config file if it doesn't exist.
  constructor (basePath) {
    this.configPath = path.join(basePath, 'config.json')
    this.dbPath = path.join(basePath, 'db')
    fs.ensureDirSync(this.dbPath)
    fs.ensureFileSync(this.configPath)

    if (fs.readFileSync(this.configPath).toString() === '') {
      this.devices = {}
      this.save()
    }

    this.devices = require(this.configPath)
  }

  // Save configuration to file system.
  save () {
    fs.writeFileSync(this.configPath, JSON.stringify(this.devices, null, 2))
    return true
  }

  // Get the argument after -d or --deviceName
  // Or return the first device name
  getDefaultDeviceName () {
    for (let index = 0; index < process.argv.length; index++) {
      let arg = process.argv[index]
      if ((arg === '-d') || (arg === '--deviceName')) {
        return process.argv[index + 1]
      }
    }

    return Object.keys(this.devices)[0]
  }

  // Return config related to device name.
  getDevice (deviceName) {
    if (deviceName == null) { deviceName = this.getDefaultDeviceName() }

    if (this.devices[deviceName] != null) {
      return this.devices[deviceName]
    } else if (Object.keys(this.devices).length === 0) {
      return {} // No device configured
    } else {
      log.error(`Device not set locally: ${deviceName}`)
      throw new Error(`Device not set locally: ${deviceName}`)
    }
  }

  // Return true if a device has been configured
  hasDevice () {
    return Object.keys(this.devices).length > 0
  }

  // Update synchronously configuration for given device.
  updateSync (deviceConfig) {
    let device = this.getDevice(deviceConfig.deviceName)
    for (let key in deviceConfig) {
      device[key] = deviceConfig[key]
    }
    this.devices[device.deviceName] = device
    this.save()
    return log.info('Configuration file successfully updated')
  }

  // Add remote configuration for a given device name.
  addRemoteCozy (options) {
    this.devices[options.deviceName] = options
    return this.save()
  }

  // Remove remote configuration for a given device name.
  removeRemoteCozy (deviceName) {
    delete this.devices[deviceName]
    return this.save()
  }

  // Get Couch URL for given device name.
  getUrl (deviceName) {
    if (deviceName == null) { deviceName = this.getDefaultDeviceName() }
    let device = this.getDevice(deviceName)
    if (device.url != null) {
      let url = urlParser.parse(device.url)
      url.auth = `${deviceName}:${device.password}`
      return `${urlParser.format(url)}cozy`
    } else {
      return null
    }
  }

  // Set the pull, push or full mode for this device
  // It wan throw an exception if the mode is not compatible with the last
  // mode used!
  setMode (mode, deviceName) {
    if (deviceName == null) { deviceName = this.getDefaultDeviceName() }
    if (deviceName && this.devices[deviceName]) {
      let old = this.devices[deviceName].mode
      switch (false) {
        case old !== mode:
          return true
        case (old == null):
          throw new Error('Incompatible mode')
        default:
          this.devices[deviceName].mode = mode
          return this.save()
      }
    } else {
      return false
    }
  }

  // Set insecure flag, for self-signed certificate mainly
  setInsecure (bool, deviceName) {
    if (deviceName == null) { deviceName = this.getDefaultDeviceName() }
    if (deviceName && __guard__(this.devices[deviceName], x => x.url)) {
      this.devices[deviceName].insecure = bool
      return this.save()
    } else {
      return false
    }
  }

  // Add some options if the insecure flag is set
  augmentCouchOptions (options, deviceName) {
    if (deviceName == null) { deviceName = this.getDefaultDeviceName() }
    if (this.devices[deviceName].insecure) {
      options.ajax = {
        rejectUnauthorized: false,
        requestCert: true,
        agent: false
      }
    }
    return options
  }
}

export default Config

function __guard__ (value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined
}
