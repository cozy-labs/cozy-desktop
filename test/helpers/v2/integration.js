let helpers
import async from 'async'
import del from 'del'
import faker from 'faker'
import fs from 'fs-extra'
import path from 'path'
import request from 'request-json-light'
import should from 'should'

import App from '../../src/app'
import passphrase from './passphrase'

// For debug:
// import PouchDB from 'pouchdb'

helpers = {
  scheme: process.env.SCHEME || 'http',
  host: process.env.HOST || 'localhost',
  port: process.env.PORT || 9104,
  passphrase: passphrase,
  deviceName: `test-${faker.internet.userName()}`,
  fixturesDir: path.join(__dirname, '..', 'fixtures'),
  parentDir: process.env.COZY_DESKTOP_DIR || 'tmp'
}

helpers.url = `${helpers.scheme}://${helpers.host}:${helpers.port}/`

helpers.ensurePreConditions = function ensurePreConditions (done) {
  let ports = [5984, 9104, 9101, 9121]
  return async.map(ports, function (port, cb) {
    let client = request.newClient(`http://${helpers.host}:${port}`)
    return client.get('/', (_, res) => cb(null, __guard__(res, x => x.statusCode)), false)
  }, function (err, results) {
    should.not.exist(err)
    let [couch, proxy, dataSystem, files] = results
    should.exist(couch, 'Couch should be running on 5984')
    should.exist(proxy, 'Cozy Proxy should be running on 9104')
    should.exist(dataSystem, 'Cozy Data System should be running on 9101')
    should.exist(files, 'Cozy Files should be running on 9121')
    done()
  })
}

helpers.registerDevice = function registerDevice (done) {
  this.syncPath = path.resolve(`${helpers.parentDir}/${+new Date()}`)
  fs.ensureDirSync(this.syncPath)
  this.app = new App(this.syncPath)
  this.app.askPassphrase = callback => callback(null, helpers.passphrase)
  let deviceName = helpers.deviceName = `test-${faker.internet.userName()}`
  return this.app.addRemote(helpers.url, this.syncPath, deviceName, function (err, credentials) {
    should.not.exist(err)
    helpers.deviceName = credentials.deviceName
    // For debug:
    // PouchDB.debug.enable 'pouchdb:*'
    done()
  })
}

helpers.clean = function clean (done) {
  // For debug:
  // PouchDB.debug.disable()
  return this.app.removeRemote(helpers.deviceName, err => {
    let callback = () => {
      return setTimeout(() => {
        del.sync(this.syncPath)
        done()
      }, 200)
    }
    should.not.exist(err)
    if (this.app.sync) {
      return this.app.stopSync(function (err) {
        should.not.exist(err)
        return callback()
      })
    } else {
      return callback()
    }
  })
}

let start = function (app, mode, done) {
  if (!app.sync) { app.instanciate() }
  app.startSync(mode, err => should.not.exist(err))
  return setTimeout(done, 1500)
}

helpers.pull = function pull (done) {
  return start(this.app, 'pull', done)
}

helpers.push = function push (done) {
  return start(this.app, 'push', done)
}

helpers.sync = function sync (done) {
  return start(this.app, 'full', done)
}

helpers.fetchRemoteMetadata = function fetchRemoteMetadata (done) {
  if (!this.app.sync) { this.app.instanciate() }
  return this.app.remote.watcher.listenToChanges({live: false}, function (err) {
    should.not.exist(err)
    done()
  })
}

export default helpers

function __guard__ (value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined
}
