import crypto from 'crypto'
import fs from 'fs'
import sinon from 'sinon'
import should from 'should'

import Remote from '../../../src/remote'

import configHelpers from '../../helpers/config'
import pouchHelpers from '../../helpers/pouch'
import couchHelpers from '../../helpers/couch'

describe('Remote', function () {
  before('instanciate config', configHelpers.createConfig)
  before('instanciate pouch', pouchHelpers.createDatabase)
  before('start couch server', couchHelpers.startServer)
  before('instanciate couch', couchHelpers.createCouchClient)
  before('instanciate remote', function () {
    this.prep = {}
    this.events = {}
    return this.remote = new Remote(this.config, this.prep, this.pouch, this.events)
  })
  after('stop couch server', couchHelpers.stopServer)
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('constructor', () =>
        it('has a couch and a watcher', function () {
          should.exist(this.remote.couch)
          return should.exist(this.remote.watcher)
        })
    )

  describe('createReadStream', () =>
        it('create a readable stream from a remote binary', function (done) {
          this.events.emit = sinon.spy()
          let checksum = '53a547469e98b667671803adc814d6d1376fae6b'
          let fixture = 'test/fixtures/cool-pillow.jpg'
          let doc = {
            path: 'pillow.jpg',
            checksum,
            mime: 'image/jpeg',
            remote: {
              binary: {
                _id: checksum,
                _rev: '1-01234'
              }
            }
          }
          this.remote.other = {
            createReadStream (localDoc, callback) {
              localDoc.should.equal(doc)
              let stream = fs.createReadStream(fixture)
              return callback(null, stream)
            }
          }
          return this.remote.uploadBinary(doc, (err, binary) => {
            should.not.exist(err)
            binary._id.should.equal(checksum)
            return this.remote.createReadStream(doc, function (err, stream) {
              should.not.exist(err)
              should.exist(stream)
              checksum = crypto.createHash('sha1')
              checksum.setEncoding('hex')
              stream.pipe(checksum)
              return stream.on('end', function () {
                checksum.end()
                checksum.read().should.equal(doc.checksum)
                done()
              })
            })
          }
            )
        })
    )

  describe('uploadBinary', function () {
    it('creates a remote binary document', function (done) {
      this.events.emit = sinon.spy()
      let checksum = 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
      let fixture = 'test/fixtures/chat-mignon.jpg'
      let doc = {
        path: 'chat.jpg',
        mime: 'image/jpeg',
        checksum
      }
      this.remote.other = {
        createReadStream (localDoc, callback) {
          localDoc.should.equal(doc)
          let stream = fs.createReadStream(fixture)
          return callback(null, stream)
        }
      }
      return this.remote.uploadBinary(doc, (err, binary) => {
        should.not.exist(err)
        binary._id.should.equal(checksum)
        return this.remote.couch.get(checksum, function (err, binaryDoc) {
          should.not.exist(err)
          binaryDoc.should.have.properties({
            _id: checksum,
            checksum,
            docType: 'Binary'
          })
          should.exist(binaryDoc._attachments)
          binaryDoc._attachments.file.length.should.equal(29865)
          done()
        })
      }
            )
    })

    it('does not reupload an existing file', function (done) {
      let checksum = 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
      let doc = {
        path: 'chat-bis.jpg',
        mime: 'image/jpeg',
        checksum
      }
      return this.remote.uploadBinary(doc, function (err, binary) {
        should.not.exist(err)
        binary._id.should.equal(checksum)
        done()
      })
    })

    it('uploads the file even if a blank binary is present', function (done) {
      let checksum = '988881adc9fc3655077dc2d4d757d480b5ea0e11'
      let fixture = 'test/fixtures/foobar.txt'
      let doc = {
        path: 'foobar.txt',
        mime: 'text/plain',
        checksum
      }
      let binary = {
        _id: checksum,
        docType: 'Binary',
        checksum
      }
      this.remote.other = {
        createReadStream (localDoc, callback) {
          localDoc.should.equal(doc)
          let stream = fs.createReadStream(fixture)
          return callback(null, stream)
        }
      }
      return this.couch.put(binary, (err, created) => {
        should.not.exist(err)
        return this.remote.uploadBinary(doc, err => {
          should.not.exist(err)
          return this.couch.get(created.id, function (err, binaryDoc) {
            should.not.exist(err)
            should.exist(binaryDoc._attachments)
            done()
          })
        }
                )
      }
            )
    })
  })

  describe('extractDirAndName', () =>
        it('returns the remote path and name', function () {
          let [path, name] = this.remote.extractDirAndName('foo')
          path.should.equal('')
          name.should.equal('foo');
          [path, name] = this.remote.extractDirAndName('foo/bar')
          path.should.equal('/foo')
          name.should.equal('bar');
          [path, name] = this.remote.extractDirAndName('foo/bar/baz')
          path.should.equal('/foo/bar')
          return name.should.equal('baz')
        })
    )

  describe('createRemoteDoc', function () {
    it('transforms a local file in remote file', function () {
      let local = {
        _id: 'FOO/BAR/BAZ.JPG',
        path: 'foo/bar/baz.jpg',
        docType: 'file',
        lastModification: '2015-11-12T13:14:32.384Z',
        creationDate: '2015-11-12T13:14:32.384Z',
        tags: ['qux'],
        localPath: '/storage/DCIM/IMG_123.jpg',
        checksum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30',
        size: 12345,
        class: 'image',
        mime: 'image/jpeg'
      }
      let remote = {
        binary: {
          _id: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30',
          _rev: '2-0123456789'
        }
      }
      let doc = this.remote.createRemoteDoc(local, remote)
      return doc.should.have.properties({
        path: '/foo/bar',
        name: 'baz.jpg',
        docType: 'file',
        lastModification: '2015-11-12T13:14:32.384Z',
        creationDate: '2015-11-12T13:14:32.384Z',
        tags: ['qux'],
        localPath: '/storage/DCIM/IMG_123.jpg',
        checksum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30',
        size: 12345,
        class: 'image',
        mime: 'image/jpeg',
        binary: {
          file: {
            id: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30',
            rev: '2-0123456789'
          }
        }
      })
    })

    it('transforms a local folder in remote folder', function () {
      let local = {
        path: 'foo/bar/baz',
        docType: 'folder',
        lastModification: '2015-11-12T13:14:33.384Z',
        creationDate: '2015-11-12T13:14:33.384Z',
        tags: ['courge']
      }
      let doc = this.remote.createRemoteDoc(local)
      return doc.should.have.properties({
        path: '/foo/bar',
        name: 'baz',
        docType: 'folder',
        lastModification: '2015-11-12T13:14:33.384Z',
        creationDate: '2015-11-12T13:14:33.384Z',
        tags: ['courge']})
    })

    it('has the good path when in root folder', function () {
      let local = {
        path: 'in-root-folder',
        docType: 'folder'
      }
      let doc = this.remote.createRemoteDoc(local)
      return doc.should.have.properties({
        path: '',  // not '/' or '.'
        name: 'in-root-folder',
        docType: 'folder'
      })
    })

    it('transforms an existing local file in remote file', function () {
      let local = {
        path: 'foo/bar/baz.jpg',
        docType: 'file',
        lastModification: '2015-11-12T13:14:32.384Z',
        creationDate: '2015-11-12T13:14:32.384Z',
        checksum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
      }
      let remote = {
        _id: 'fc4de46b9b42aaeb23521ff42e23a18e7a812bda',
        _rev: '1-951357',
        binary: {
          _id: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30',
          _rev: '1-456951'
        }
      }
      let doc = this.remote.createRemoteDoc(local, remote)
      return doc.should.have.properties({
        _id: remote._id,
        _rev: remote._rev,
        path: '/foo/bar',
        name: 'baz.jpg',
        docType: 'file',
        lastModification: '2015-11-12T13:14:32.384Z',
        creationDate: '2015-11-12T13:14:32.384Z',
        binary: {
          file: {
            id: remote.binary._id,
            rev: remote.binary._rev
          }
        }
      })
    })
  })

  describe('cleanBinary', function () {
    it('deletes the binary if no longer referenced', function (done) {
      let binary = {
        _id: 'binary-5b1b',
        checksum: '5b1baec8306885df52fdf341efb0087f1a8ac81e',
        docType: 'Binary'
      }
      return this.couch.put(binary, (err, created) => {
        should.not.exist(err)
        return this.remote.cleanBinary(binary._id, err => {
          should.not.exist(err)
          return this.couch.get(binary.id, function (err) {
            err.status.should.equal(404)
            done()
          })
        }
                )
      }
            )
    })

    it('keeps the binary if referenced by a file', function (done) {
      let binary = {
        _id: 'binary-b410',
        checksum: 'b410ffdd571d6e86bb8e8bdd054df91e16dfa75e',
        docType: 'Binary'
      }
      let file = {
        _id: 'A-FILE-WITH-B410',
        path: 'A-FILE-WITH-B410',
        docType: 'file',
        checksum: 'b410ffdd571d6e86bb8e8bdd054df91e16dfa75e',
        remote: {
          id: 'remote-file-b410',
          rev: '1-123456',
          binary: {
            _id: 'binary-410',
            _rev: '1-123456'
          }
        }
      }
      this.pouch.db.put(file, err => {
        should.not.exist(err)
        return this.couch.put(binary, err => {
          should.not.exist(err)
          return this.remote.cleanBinary(binary._id, err => {
            should.not.exist(err)
            return this.couch.get(binary._id, function (err, doc) {
              should.not.exist(err)
              doc._id.should.equal(binary._id)
              doc.checksum.should.equal(binary.checksum)
              done()
            })
          }
                    )
        }
                )
      }
            )
    })
  })

  describe('isUpToDate', () =>
        it('says if the remote file is up to date', function () {
          let doc = {
            _id: 'foo/bar',
            _rev: '1-0123456',
            path: 'foo/bar',
            docType: 'file',
            checksum: '22f7aca0d717eb322d5ae1c97d8aa26eb440287b',
            sides: {
              local: 1
            }
          }
          this.remote.isUpToDate(doc).should.be.false()
          doc.sides.remote = 2
          doc._rev = '2-0123456'
          this.remote.isUpToDate(doc).should.be.true()
          doc.sides.local = 3
          doc._rev = '3-0123456'
          return this.remote.isUpToDate(doc).should.be.false()
        })
    )

  describe('addFile', function () {
    it('adds a file to couchdb', function (done) {
      let checksum = 'fc7e0b72b8e64eb05e05aef652d6bbed950f85df'
      let doc = {
        _id: 'cat2.jpg',
        path: 'cat2.jpg',
        docType: 'file',
        checksum,
        creationDate: new Date(),
        lastModification: new Date(),
        size: 36901,
        sides: {
          local: 1
        }
      }
      let fixture = 'test/fixtures/chat-mignon-mod.jpg'
      this.remote.other = {
        createReadStream (localDoc, callback) {
          let stream = fs.createReadStream(fixture)
          return callback(null, stream)
        }
      }
      this.pouch.db.put(doc, err => {
        should.not.exist(err)
        return this.remote.addFile(doc, (err, created) => {
          should.not.exist(err)
          should.exist(doc.remote._id)
          should.exist(doc.remote._rev)
          should.exist(doc.remote.binary)
          return this.couch.get(created.id, (err, file) => {
            should.not.exist(err)
            file.should.have.properties({
              path: '',
              name: 'cat2.jpg',
              docType: 'file',
              creationDate: doc.creationDate.toISOString(),
              lastModification: doc.lastModification.toISOString(),
              size: 36901
            })
            should.exist(file.binary.file.id)
            return this.couch.get(file.binary.file.id, function (err, binary) {
              should.not.exist(err)
              binary.checksum.should.equal(checksum)
              done()
            })
          }
                    )
        }
                )
      }
            )
    })

    it('does not reupload an existing file', function (done) {
      let checksum = 'fc7e0b72b8e64eb05e05aef652d6bbed950f85df'
      let doc = {
        _id: 'backup/cat3.jpg',
        path: 'backup/cat3.jpg',
        docType: 'file',
        checksum,
        creationDate: new Date(),
        lastModification: new Date(),
        size: 36901,
        sides: {
          local: 1
        }
      }
      let same = {
        _id: 'ORIGINAL/CAT3.JPG',
        path: 'ORIGINAL/CAT3.JPG',
        docType: 'file',
        checksum,
        creationDate: new Date(),
        lastModification: new Date(),
        size: 36901,
        remote: {
          _id: '05161241-ca73',
          _rev: '1-abcdef',
          binary: {
            _id: checksum,
            _rev: '1-951456'
          }
        },
        sides: {
          local: 1,
          remote: 1
        }
      }
      this.pouch.db.put(doc, err => {
        should.not.exist(err)
        return this.pouch.db.put(same, err => {
          should.not.exist(err)
          return this.remote.addFile(doc, (err, created) => {
            should.not.exist(err)
            should.exist(doc.remote._id)
            should.exist(doc.remote._rev)
            should.exist(doc.remote.binary)
            return this.couch.get(created.id, function (err, file) {
              should.not.exist(err)
              let lastModified = doc.lastModification.toISOString()
              file.should.have.properties({
                path: '/backup',
                name: 'cat3.jpg',
                docType: 'file',
                creationDate: doc.creationDate.toISOString(),
                lastModification: lastModified,
                size: 36901
              })
              done()
            })
          }
                    )
        }
                )
      }
            )
    })
  })

  describe('addFolder', () =>
        it('adds a folder to couchdb', function (done) {
          let doc = {
            path: 'couchdb-folder/folder-1',
            docType: 'folder',
            creationDate: new Date(),
            lastModification: new Date()
          }
          return this.remote.addFolder(doc, (err, created) => {
            should.not.exist(err)
            should.exist(doc.remote._id)
            should.exist(doc.remote._rev)
            return this.couch.get(created.id, function (err, folder) {
              should.not.exist(err)
              folder.should.have.properties({
                path: '/couchdb-folder',
                name: 'folder-1',
                docType: 'folder',
                creationDate: doc.creationDate.toISOString(),
                lastModification: doc.lastModification.toISOString()
              })
              done()
            })
          }
            )
        })
    )

  describe('overwriteFile', function () {
    it('overwrites the binary content', function (done) {
      return couchHelpers.createFile(this.couch, 6, (err, created) => {
        should.not.exist(err)
        let doc = {
          _id: 'couchdb-folder/file-6',
          path: 'couchdb-folder/file-6',
          docType: 'file',
          checksum: 'fc7e0b72b8e64eb05e05aef652d6bbed950f85df',
          lastModification: '2015-11-16T16:12:01.002Z',
          sides: {
            local: 1
          }
        }
        let old = {
          path: 'couchdb-folder/file-6',
          docType: 'file',
          checksum: '1111111111111111111111111111111111111126',
          remote: {
            _id: created.id,
            _rev: created.rev,
            binary: {
              _id: '1111111111111111111111111111111111111126',
              _rev: '1-852147'
            }
          }
        }
        let binaryDoc = {
          _id: old.checksum,
          checksum: old.checksum
        }
        return this.pouch.db.put(doc, err => {
          should.not.exist(err)
          return this.couch.put(binaryDoc, err => {
            should.not.exist(err)
            return this.remote.overwriteFile(doc, old, err => {
              should.not.exist(err)
              return this.couch.get(doc.remote._id, (err, file) => {
                should.not.exist(err)
                file.should.have.properties({
                  _id: created.id,
                  docType: 'file',
                  path: '/couchdb-folder',
                  name: 'file-6',
                  lastModification: doc.lastModification
                })
                doc.remote._rev.should.equal(file._rev)
                doc.remote.binary.should.have.properties({
                  _id: doc.checksum,
                  _rev: file.binary.file.rev
                })
                file.binary.file.id.should.equal(doc.checksum)
                return this.couch.get(file.binary.file.id, function (err, binary) {
                  should.not.exist(err)
                  binary.checksum.should.equal(doc.checksum)
                  done()
                })
              }
                            )
            }
                        )
          }
                    )
        }
                )
      }
            )
    })

    it('throws an error if the checksum is invalid', function (done) {
      return couchHelpers.createFile(this.couch, 6, (err, created) => {
        should.not.exist(err)
        let doc = {
          path: 'couchdb-folder/file-6b',
          docType: 'file',
          checksum: '9999999999999999999999999999999999999936',
          lastModification: '2015-11-16T16:12:01.002Z'
        }
        let old = {
          path: 'couchdb-folder/file-6b',
          docType: 'file',
          checksum: '1111111111111111111111111111111111111136',
          remote: {
            _id: created.id,
            _rev: created.rev,
            binary: {
              _id: '1111111111111111111111111111111111111136',
              _rev: '1-852146'
            }
          }
        }
        let binaryDoc = {
          _id: old.checksum,
          checksum: old.checksum
        }
        return this.couch.put(binaryDoc, err => {
          should.not.exist(err)
          return this.remote.overwriteFile(doc, old, function (err) {
            should.exist(err)
            err.message.should.equal('Invalid checksum')
            done()
          })
        }
                )
      }
            )
    })
  })

  describe('updateFileMetadata', () =>
        it('updates the lastModification', function (done) {
          return couchHelpers.createFile(this.couch, 7, (err, created) => {
            should.not.exist(err)
            let doc = {
              path: 'couchdb-folder/file-7',
              docType: 'file',
              checksum: '1111111111111111111111111111111111111127',
              lastModification: '2015-11-16T16:13:01.001Z'
            }
            let old = {
              path: 'couchdb-folder/file-7',
              docType: 'file',
              checksum: '1111111111111111111111111111111111111127',
              remote: {
                _id: created.id,
                _rev: created.rev,
                binary: {
                  _id: '1111111111111111111111111111111111111127',
                  _rev: '1-852654'
                }
              }
            }
            return this.remote.updateFileMetadata(doc, old, err => {
              should.not.exist(err)
              return this.couch.get(doc.remote._id, function (err, file) {
                should.not.exist(err)
                file.should.have.properties({
                  _id: created.id,
                  docType: 'file',
                  path: '/couchdb-folder',
                  name: 'file-7',
                  lastModification: doc.lastModification,
                  binary: {
                    file: {
                      id: doc.remote.binary._id,
                      rev: doc.remote.binary._rev
                    }
                  }
                })
                doc.remote._rev.should.equal(file._rev)
                done()
              })
            }
                )
          }
            )
        })
    )

  describe('updateFolder', function () {
    it('updates the metadata of a folder in couchdb', function (done) {
      return couchHelpers.createFolder(this.couch, 2, (err, created) => {
        let doc = {
          path: 'couchdb-folder/folder-2',
          docType: 'folder',
          creationDate: new Date(),
          lastModification: new Date()
        }
        let old = {
          path: 'couchdb-folder/folder-2',
          docType: 'folder',
          remote: {
            _id: created.id,
            _rev: created.rev
          }
        }
        return this.remote.updateFolder(doc, old, (err, updated) => {
          should.not.exist(err)
          doc.remote._id.should.equal(old.remote._id)
          doc.remote._rev.should.not.equal(created.rev)
          return this.couch.get(updated.id, function (err, folder) {
            should.not.exist(err)
            folder.should.have.properties({
              path: '/couchdb-folder',
              name: 'folder-2',
              docType: 'folder',
              lastModification: doc.lastModification.toISOString()
            })
            done()
          })
        }
                )
      }
            )
    })

    it('adds a folder to couchdb if the folder does not exist', function (done) {
      let doc = {
        path: 'couchdb-folder/folder-3',
        docType: 'folder',
        creationDate: new Date(),
        lastModification: new Date()
      }
      return this.remote.updateFolder(doc, {}, (err, created) => {
        should.not.exist(err)
        return this.couch.get(created.id, function (err, folder) {
          should.not.exist(err)
          folder.should.have.properties({
            path: '/couchdb-folder',
            name: 'folder-3',
            docType: 'folder',
            creationDate: doc.creationDate.toISOString(),
            lastModification: doc.lastModification.toISOString()
          })
          done()
        })
      }
            )
    })
  })

  describe('moveFile', () =>
        it('moves the file', function (done) {
          let checksum = 'fc7e0b72b8e64eb05e05aef652d6bbed950f85df'
          let binary = {
            _id: checksum,
            _rev: '1-0123456789'
          }
          let old = {
            path: 'cat6.jpg',
            docType: 'file',
            checksum,
            creationDate: new Date(),
            lastModification: new Date(),
            size: 36901
          }
          let doc = {
            path: 'moved-to/cat7.jpg',
            docType: 'file',
            checksum,
            creationDate: new Date(),
            lastModification: new Date(),
            size: 36901
          }
          let remoteDoc = this.remote.createRemoteDoc(old, {binary})
          return this.couch.put(remoteDoc, (err, created) => {
            should.not.exist(err)
            old.remote = {
              _id: created.id,
              _rev: created.rev,
              binary: {
                _id: checksum,
                _rev: binary._rev
              }
            }
            return this.remote.moveFile(doc, old, (err, moved) => {
              should.not.exist(err)
              moved.id.should.equal(old.remote._id)
              moved.rev.should.not.equal(old.remote._rev)
              return this.couch.get(moved.id, function (err, file) {
                should.not.exist(err)
                file.should.have.properties({
                  path: '/moved-to',
                  name: 'cat7.jpg',
                  docType: 'file',
                  lastModification: doc.lastModification.toISOString(),
                  size: 36901,
                  binary: {
                    file: {
                      id: binary._id,
                      rev: binary._rev
                    }
                  }
                })
                done()
              })
            }
                )
          }
            )
        })
    )

  describe('moveFolder', function () {
    it('moves the folder in couchdb', function (done) {
      return couchHelpers.createFolder(this.couch, 4, (err, created) => {
        let doc = {
          path: 'couchdb-folder/folder-5',
          docType: 'folder',
          creationDate: new Date(),
          lastModification: new Date(),
          remote: {
            _id: created.id,
            _rev: created.rev
          }
        }
        let old = {
          path: 'couchdb-folder/folder-4',
          docType: 'folder',
          remote: {
            _id: created.id,
            _rev: created.rev
          }
        }
        return this.remote.moveFolder(doc, old, (err, created) => {
          should.not.exist(err)
          return this.couch.get(created.id, function (err, folder) {
            should.not.exist(err)
            folder.should.have.properties({
              path: '/couchdb-folder',
              name: 'folder-5',
              docType: 'folder',
              lastModification: doc.lastModification.toISOString()
            })
            done()
          })
        }
                )
      }
            )
    })

    it('adds a folder to couchdb if the folder does not exist', function (done) {
      let doc = {
        path: 'couchdb-folder/folder-7',
        docType: 'folder',
        creationDate: new Date(),
        lastModification: new Date()
      }
      let old = {
        path: 'couchdb-folder/folder-6',
        docType: 'folder'
      }
      return this.remote.moveFolder(doc, old, (err, created) => {
        should.not.exist(err)
        return this.couch.get(created.id, function (err, folder) {
          should.not.exist(err)
          folder.should.have.properties({
            path: '/couchdb-folder',
            name: 'folder-7',
            docType: 'folder',
            creationDate: doc.creationDate.toISOString(),
            lastModification: doc.lastModification.toISOString()
          })
          done()
        })
      }
            )
    })
  })

  describe('deleteFile', function () {
    it('deletes a file in couchdb', function (done) {
      return couchHelpers.createFile(this.couch, 8, (err, file) => {
        should.not.exist(err)
        let doc = {
          path: 'couchdb-folder/file-8',
          _deleted: true,
          docType: 'file',
          checksum: '1111111111111111111111111111111111111128',
          remote: {
            _id: file.id,
            _rev: file.rev,
            binary: {
              _id: '1111111111111111111111111111111111111128',
              _rev: '1-754123'
            }
          }
        }
        return this.couch.get(doc.remote._id, err => {
          should.not.exist(err)
          return this.remote.deleteFile(doc, err => {
            should.not.exist(err)
            return this.couch.get(doc.remote._id, function (err) {
              err.status.should.equal(404)
              done()
            })
          }
                    )
        }
                )
      }
            )
    })

    it('deletes also the associated binary', function (done) {
      return couchHelpers.createFile(this.couch, 9, (err, file) => {
        should.not.exist(err)
        let doc = {
          path: 'couchdb-folder/file-9',
          _deleted: true,
          docType: 'file',
          checksum: '1111111111111111111111111111111111111129',
          remote: {
            _id: file.id,
            _rev: file.rev,
            binary: {
              _id: '1111111111111111111111111111111111111129',
              _rev: '1-954862'
            }
          }
        }
        let binary = {
          _id: doc.checksum,
          checksum: doc.checksum
        }
        return this.couch.put(binary, (err, uploaded) => {
          should.not.exist(err)
          doc.remote.binary = {
            _id: uploaded.id,
            _rev: uploaded.rev
          }
          return this.remote.deleteFile(doc, err => {
            should.not.exist(err)
            return this.couch.get(binary._id, function (err) {
              err.status.should.equal(404)
              done()
            })
          }
                    )
        }
                )
      }
            )
    })
  })

  describe('deleteFolder', () =>
        it('deletes a folder in couchdb', function (done) {
          return couchHelpers.createFolder(this.couch, 9, (err, folder) => {
            should.not.exist(err)
            let doc = {
              path: 'couchdb-folder/folder-9',
              _deleted: true,
              docType: 'folder',
              remote: {
                _id: folder.id,
                _rev: folder.rev
              }
            }
            return this.couch.get(doc.remote._id, err => {
              should.not.exist(err)
              return this.remote.deleteFolder(doc, err => {
                should.not.exist(err)
                return this.couch.get(doc.remote._id, function (err) {
                  err.status.should.equal(404)
                  done()
                })
              }
                    )
            }
                )
          }
            )
        })
    )

  describe('resolveConflict', () =>
        it('renames the file/folder', function (done) {
          let checksum = 'fc7e0b72b8e64eb05e05aef652d6bbed950f85df'
          let binary = {
            _id: checksum,
            _rev: '1-0123456789'
          }
          let src = {
            path: 'cat9.jpg',
            docType: 'file',
            checksum,
            creationDate: new Date().toISOString(),
            lastModification: new Date().toISOString(),
            size: 36901
          }
          let dst = {
            path: 'cat-conflict-2015-12-01T01:02:03Z.jpg',
            docType: 'file',
            checksum,
            creationDate: src.creationDate,
            lastModification: src.lastModification,
            size: 36901
          }
          let remoteDoc = this.remote.createRemoteDoc(src, {binary})
          return this.couch.put(remoteDoc, (err, created) => {
            should.not.exist(err)
            src.remote = {
              _id: created.id,
              _rev: created.rev,
              binary: {
                _id: checksum,
                _rev: binary._rev
              }
            }
            return this.remote.resolveConflict(dst, src, (err, moved) => {
              should.not.exist(err)
              return this.couch.get(moved.id, function (err, file) {
                should.not.exist(err)
                file.should.have.properties({
                  path: '',
                  name: dst.path,
                  docType: 'file',
                  lastModification: dst.lastModification,
                  size: 36901,
                  binary: {
                    file: {
                      id: binary._id,
                      rev: binary._rev
                    }
                  }
                })
                done()
              })
            }
                )
          }
            )
        })
    )
})
