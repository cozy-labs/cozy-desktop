/* eslint-env mocha */

import { device } from 'cozy-device-sdk'
import should from 'should'

import Cozy from '../helpers/integration'

describe('device', function () {
  this.slow(1000)
  this.timeout(10000)

  before(Cozy.ensurePreConditions)

  describe('pingCozy', function () {
    it('says OK when the URL belongs to a cozy', done =>
      device.pingCozy(Cozy.url, function (err) {
        should.not.exist(err)
        done()
      })
    )

    it('says KO else', done =>
      device.pingCozy('http://localhost:12345', function (err) {
        should.exist(err)
        done()
      })
    )
  })

  describe('checkCredentials', function () {
    it('says OK with good credentials', done =>
      device.checkCredentials(Cozy.url, Cozy.passphrase, function (err) {
        should.not.exist(err)
        done()
      })
    )

    it('says KO with bad credentials', done =>
      device.checkCredentials(Cozy.url, 'xxxxxxxx', function (err) {
        should.exist(err)
        done()
      })
    )
  })

  let devicePasswords = []

  describe('registerDeviceSafe', function () {
    it('gives an error when the passphrase is invalid', function (done) {
      let register = device.registerDeviceSafe
      return register(Cozy.url, Cozy.deviceName, 'xxxxxxxx', function (err) {
        err.should.equal('Bad credentials')
        done()
      })
    })

    it('register a device', function (done) {
      let register = device.registerDeviceSafe
      return register(Cozy.url, Cozy.deviceName, Cozy.passphrase, function (err, res) {
        should.not.exist(err)
        should.exist(res)
        should.exist(res.passphrase)
        should.exist(res.deviceName)
        res.deviceName.should.equal(Cozy.deviceName)
        devicePasswords.push(res.passphrase)
        done()
      })
    })

    it('register a device with a suffix when it already exists', function (done) {
      let register = device.registerDeviceSafe
      return register(Cozy.url, Cozy.deviceName, Cozy.passphrase, function (err, res) {
        should.not.exist(err)
        should.exist(res)
        should.exist(res.passphrase)
        should.exist(res.deviceName)
        res.deviceName.should.not.equal(Cozy.deviceName)
        res.deviceName.should.match(/-2$/)
        devicePasswords.push(res.passphrase)
        done()
      })
    })

    it('register a device with a suffix when it already exists', function (done) {
      let register = device.registerDeviceSafe
      return register(Cozy.url, Cozy.deviceName, Cozy.passphrase, function (err, res) {
        should.not.exist(err)
        should.exist(res)
        should.exist(res.passphrase)
        should.exist(res.deviceName)
        res.deviceName.should.not.equal(Cozy.deviceName)
        res.deviceName.should.match(/-3$/)
        devicePasswords.push(res.passphrase)
        done()
      })
    })
  })

  describe('unregisterDevice', function () {
    it('gives an error when the passphrase is invalid', function (done) {
      let unregister = device.unregisterDevice
      return unregister(Cozy.url, Cozy.deviceName, 'xxxxxxxx', function (err) {
        should.exist(err)
        if (err.message === 'Bad credentials') {
          err.message.should.equal('Bad credentials')
        } else {
          err.message.should.equal('Request unauthorized')
        }
        done()
      })
    })

    it('unregister a device', function (done) {
      let unregister = device.unregisterDevice
      return unregister(Cozy.url, Cozy.deviceName, devicePasswords[0], function (err) {
        should.not.exist(err)
        done()
      })
    })

    it('unregister a device (bis)', function (done) {
      let deviceName = `${Cozy.deviceName}-2`
      let unregister = device.unregisterDevice
      return unregister(Cozy.url, deviceName, devicePasswords[1], function (err) {
        should.not.exist(err)
        done()
      })
    })

    it('unregister a device (ter)', function (done) {
      let deviceName = `${Cozy.deviceName}-3`
      let unregister = device.unregisterDevice
      return unregister(Cozy.url, deviceName, devicePasswords[2], function (err) {
        should.not.exist(err)
        done()
      })
    })
  })
})
