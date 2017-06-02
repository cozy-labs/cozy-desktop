let helpers
import async from 'async'
import request from 'request-json-light'
import should from 'should'

let url = 'http://localhost:9121'
let client = request.newClient(url)

// Manipulate files and folders on a remote cozy, via the files application
export default helpers = {

  deleteAll (callback) {
    this.timeout(10000)
    return helpers.getFolderContent({id: 'root'}, (_, items) =>
      async.each(items, function (item, cb) {
        url = `${item.docType.toLowerCase()}s/${item.id}`
        return client.del(url, function (err, res, body) {
          should.not.exist(err)
          should.exist(res)
          should.exist(body)
          return setTimeout(cb, 1000)
        })
      }, callback)
    )
  },

  getAllFiles (callback) {
    return client.get('files', function (err, res, body) {
      should.not.exist(err)
      should.exist(body)
      return callback(err, body)
    })
  },

  getFileContent (file, callback) {
    url = `files/${file.id}/attach/${file.name}`
    return client.get(url, function (err, res, body) {
      should.not.exist(err)
      should.exist(res)
      should.exist(body)
      res.statusCode.should.equal(200)
      return callback(err, body)
    })
  },

  uploadFile (file, fixturePath, callback) {
    file.lastModification = new Date().toISOString()
    return client.sendFile('files/', fixturePath, file, function (err, res, body) {
      should.not.exist(err)
      should.exist(res)
      should.exist(body)
      if (res.statusCode !== 200) { console.log(body) }
      res.statusCode.should.equal(200)
      return client.get(`files/${body.id}`, file, function (err, res, body) {
        res.statusCode.should.equal(200)
        return callback(err, body)
      })
    })
  },

  updateFile (file, callback) {
    return client.put(`files/${file.id}`, file, function (err, res, body) {
      should.not.exist(err)
      should.exist(res)
      should.exist(body)
      res.statusCode.should.equal(200)
      return callback()
    })
  },

  removeFile (file, callback) {
    return client.del(`files/${file.id}`, function (err, res, body) {
      should.not.exist(err)
      should.exist(res)
      should.exist(body)
      res.statusCode.should.equal(200)
      return callback()
    })
  },

  getAllFolders (callback) {
    return client.get('folders/folders', function (err, res, body) {
      should.not.exist(err)
      should.exist(body)
      return callback(err, body)
    })
  },

  getFolderContent (folder, callback) {
    return client.post('/folders/content', folder, function (err, res, body) {
      should.not.exist(err)
      should.exist(res)
      should.exist(body)
      body.should.have.property('content')
      return callback(err, body.content)
    })
  },

  createFolder (folder, callback) {
    return client.post('folders/', folder, function (err, res, body) {
      should.not.exist(err)
      should.exist(res)
      should.exist(body)
      res.statusCode.should.equal(200)
      return client.get(`folders/${body.id}`, function (err, res, body) {
        res.statusCode.should.equal(200)
        return callback(err, body)
      })
    })
  },

  updateFolder (folder, callback) {
    return client.put(`folders/${folder.id}`, folder, function (err, res, body) {
      should.not.exist(err)
      should.exist(res)
      should.exist(body)
      res.statusCode.should.equal(200)
      return callback(err, body)
    })
  },

  removeFolder (folder, callback) {
    return client.del(`folders/${folder.id}`, folder, function (err, res, body) {
      should.not.exist(err)
      should.exist(res)
      should.exist(body)
      res.statusCode.should.equal(204)
      return callback(err, body)
    })
  }
}
