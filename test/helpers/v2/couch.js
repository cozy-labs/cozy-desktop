import async from 'async'
import child from 'child_process'
import fs from 'fs-extra'
import path from 'path'
import request from 'request-json-light'

import Couch from '../../../src/remote/v2/couch'

let params = {
  db: 'cozy',
  user: 'cozyuser',
  pass: 'cozytest',
  port: 5895
}

let url = `http://localhost:${params.port}`

// We use pouchdb-server as a fake couchdb instance for unit tests
export default {

  params,
  url,

  startServer (done) {
    let client = request.newClient(url)
    return async.waterfall([
      // Start the server
      next => {
        let bin = path.resolve('node_modules/.bin/pouchdb-server')
        let args = ['-n', '-m', '-p', `${params.port}`]
        let opts = {cwd: process.env.COZY_DESKTOP_DIR || '/tmp'}
        fs.ensureDirSync(opts.cwd)
        this.server = child.spawn(bin, args, opts)
        return setTimeout(next, 500)
      },

      // Create a user
      function (next) {
        let options = {
          _id: `org.couchdb.user:${params.user}`,
          name: params.user,
          type: 'user',
          roles: [],
          passphrase: params.pass
        }
        return async.retry({times: 30, interval: 250}, cb => client.put(`_users/${params.user}`, options, cb)
        , err => next(err))
      },

      // Create a database
      function (next) {
        let options = {
          id: params.db,
          name: params.db
        }
        return client.put(params.db, options, err => next(err))
      },

      // Add the user to the database admins
      function (next) {
        let options = {
          admins: {
            names: [params.user],
            roles: []
          },
          users: {
            names: [],
            roles: []
          }
        }
        return client.put(`${params.db}/_security`, options, err => next(err))
      }
    ], done)
  },

  stopServer (done) {
    this.server.kill()
    return setTimeout(done, 100)
  },

  createCouchClient () {
    this.config.removeRemoteCozy(this.config.getDefaultDeviceName())
    this.config.addRemoteCozy({
      url,
      deviceName: params.user,
      passphrase: params.pass
    })
    let events = {emit () {}}
    this.couch = new Couch(this.config, events)
  },

  createFolder (couch, i, callback) {
    let doc = {
      _id: Couch.newId(),
      path: '/couchdb-folder',
      name: `folder-${i}`,
      docType: 'folder',
      creationDate: new Date(),
      lastModification: new Date(),
      tags: []
    }
    return couch.put(doc, callback)
  },

  createFile (couch, i, callback) {
    let doc = {
      _id: Couch.newId(),
      path: '/couchdb-folder',
      name: `file-${i}`,
      docType: 'file',
      md5sum: `111111111111111111111111111111111111112${i}`,
      creationDate: new Date(),
      lastModification: new Date(),
      tags: []
    }
    return couch.put(doc, callback)
  }
}
