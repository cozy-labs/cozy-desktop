/* eslint-env mocha */

import async from 'async'
import clone from 'lodash.clone'
import sinon from 'sinon'
import should from 'should'

import Merge from '../../src/merge'

import configHelpers from '../helpers/config'
import pouchHelpers from '../helpers/pouch'

describe('Merge', function () {
  before('instanciate config', configHelpers.createConfig)
  before('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('instanciate merge', function () {
    this.side = 'local'
    this.merge = new Merge(this.pouch)
  })
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('addFile', function () {
    it('saves the new file', function (done) {
      this.merge.ensureParentExist = sinon.stub().yields(null)
      let doc = {
        _id: 'foo/new-file',
        path: 'foo/new-file',
        checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc',
        docType: 'file',
        creationDate: new Date(),
        lastModification: new Date(),
        tags: ['courge', 'quux'],
        localPath: '/storage/DCIM/IMG_123.jpg'
      }
      return this.merge.addFile(this.side, doc, err => {
        should.not.exist(err)
        return this.pouch.db.get(doc._id, function (err, res) {
          should.not.exist(err)
          for (let date of ['creationDate', 'lastModification']) {
            doc[date] = doc[date].toISOString()
          }
          res.should.have.properties(doc)
          res.sides.local.should.equal(1)
          done()
        })
      }
            )
    })

    describe('when a file with the same path exists', function () {
      before('create a file', function (done) {
        this.file = {
          _id: 'BUZZ.JPG',
          path: 'BUZZ.JPG',
          docType: 'file',
          checksum: '1111111111111111111111111111111111111111',
          creationDate: new Date(),
          lastModification: new Date(),
          tags: ['foo'],
          size: 12345,
          class: 'image',
          mime: 'image/jpeg'
        }
        this.pouch.db.put(this.file, done)
      })

      it('can update the metadata', function (done) {
        this.merge.ensureParentExist = sinon.stub().yields(null)
        let was = clone(this.file)
        this.file.tags = ['bar', 'baz']
        this.file.lastModification = new Date()
        let doc = clone(this.file)
        delete doc.size
        delete doc.class
        delete doc.mime
        this.file.creationDate = doc.creationDate.toISOString()
        this.file.lastModification = doc.lastModification.toISOString()
        return this.merge.addFile(this.side, doc, err => {
          should.not.exist(err)
          return this.pouch.db.get(doc._id, (err, res) => {
            should.not.exist(err)
            res.should.have.properties(this.file)
            res.size.should.equal(was.size)
            res.class.should.equal(was.class)
            res.mime.should.equal(was.mime)
            res.sides.local.should.equal(2)
            done()
          }
                    )
        }
                )
      })
    })
  })

  describe('updateFile', function () {
    it('saves the new file', function (done) {
      this.merge.ensureParentExist = sinon.stub().yields(null)
      let doc = {
        _id: 'FOOBAR/NEW-FILE',
        path: 'FOOBAR/NEW-FILE',
        checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc',
        docType: 'file',
        creationDate: new Date(),
        lastModification: new Date(),
        tags: ['courge', 'quux']
      }
      return this.merge.updateFile(this.side, doc, err => {
        should.not.exist(err)
        return this.pouch.db.get(doc._id, function (err, res) {
          should.not.exist(err)
          for (let date of ['creationDate', 'lastModification']) {
            doc[date] = doc[date].toISOString()
          }
          res.should.have.properties(doc)
          res.sides.local.should.equal(1)
          done()
        })
      }
            )
    })

    describe('when a file with the same path exists', function () {
      before('create a file', function (done) {
        this.file = {
          _id: 'FIZZBUZZ.JPG',
          path: 'FIZZBUZZ.JPG',
          docType: 'file',
          checksum: '1111111111111111111111111111111111111111',
          creationDate: new Date(),
          lastModification: new Date(),
          tags: ['foo'],
          size: 12345,
          class: 'image',
          mime: 'image/jpeg'
        }
        this.pouch.db.put(this.file, done)
      })

      it('can update the metadata', function (done) {
        this.merge.ensureParentExist = sinon.stub().yields(null)
        let was = clone(this.file)
        this.file.tags = ['bar', 'baz']
        this.file.lastModification = new Date()
        let doc = clone(this.file)
        delete doc.size
        delete doc.class
        delete doc.mime
        this.file.creationDate = doc.creationDate.toISOString()
        this.file.lastModification = doc.lastModification.toISOString()
        return this.merge.updateFile(this.side, doc, err => {
          should.not.exist(err)
          return this.pouch.db.get(doc._id, (err, res) => {
            should.not.exist(err)
            res.should.have.properties(this.file)
            res.size.should.equal(was.size)
            res.class.should.equal(was.class)
            res.mime.should.equal(was.mime)
            res.sides.local.should.equal(2)
            done()
          }
                    )
        }
                )
      })

      it('can overwrite the content of a file', function (done) {
        this.merge.ensureParentExist = sinon.stub().yields(null)
        let doc = {
          _id: 'FIZZBUZZ.JPG',
          path: 'FIZZBUZZ.JPG',
          docType: 'file',
          checksum: '3333333333333333333333333333333333333333',
          tags: ['qux', 'quux']
        }
        return this.merge.updateFile(this.side, clone(doc), err => {
          should.not.exist(err)
          return this.pouch.db.get(this.file._id, function (err, res) {
            should.not.exist(err)
            res.should.have.properties(doc)
            should.not.exist(res.size)
            should.not.exist(res.class)
            should.not.exist(res.mime)
            res.sides.local.should.equal(3)
            done()
          })
        }
                )
      })
    })
  })

  describe('putFolder', () =>
        it('saves the new folder', function (done) {
          this.merge.ensureParentExist = sinon.stub().yields(null)
          let doc = {
            _id: 'FOO/NEW-FOLDER',
            path: 'FOO/NEW-FOLDER',
            docType: 'folder',
            creationDate: new Date(),
            lastModification: new Date(),
            tags: ['courge', 'quux']
          }
          return this.merge.putFolder(this.side, doc, err => {
            should.not.exist(err)
            doc.creationDate = doc.creationDate.toISOString()
            doc.lastModification = doc.lastModification.toISOString()
            return this.pouch.db.get(doc._id, function (err, res) {
              should.not.exist(err)
              res.should.have.properties(doc)
              res.sides.local.should.equal(1)
              done()
            })
          }
            )
        })
    )

  describe('moveFile', function () {
    it('saves the new file and deletes the old one', function (done) {
      this.merge.ensureParentExist = sinon.stub().yields(null)
      let doc = {
        _id: 'FOO/NEW',
        path: 'FOO/NEW',
        checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517',
        docType: 'file',
        creationDate: new Date(),
        lastModification: new Date(),
        tags: ['courge', 'quux']
      }
      let was = {
        _id: 'FOO/OLD',
        path: 'FOO/OLD',
        checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517',
        docType: 'file',
        creationDate: new Date(),
        lastModification: new Date(),
        tags: ['courge', 'quux'],
        sides: {
          local: 1,
          remote: 1
        }
      }
      this.pouch.db.put(clone(was), (err, inserted) => {
        should.not.exist(err)
        was._rev = inserted.rev
        return this.merge.moveFile(this.side, clone(doc), clone(was), err => {
          should.not.exist(err)
          return this.pouch.db.get(doc._id, (err, res) => {
            should.not.exist(err)
            for (let date of ['creationDate', 'lastModification']) {
              doc[date] = doc[date].toISOString()
            }
            res.should.have.properties(doc)
            res.sides.local.should.equal(1)
            return this.pouch.db.get(was._id, function (err, res) {
              should.exist(err)
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

    it('adds missing fields', function (done) {
      this.merge.ensureParentExist = sinon.stub().yields(null)
      let doc = {
        _id: 'FOO/NEW-MISSING-FIELDS.JPG',
        path: 'FOO/NEW-MISSING-FIELDS.JPG',
        checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517'
      }
      let was = {
        _id: 'FOO/OLD-MISSING-FIELDS.JPG',
        path: 'FOO/OLD-MISSING-FIELDS.JPG',
        checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517',
        docType: 'file',
        creationDate: new Date(),
        lastModification: new Date(),
        tags: ['courge', 'quux'],
        size: 5426,
        class: 'image',
        mime: 'image/jpeg',
        sides: {
          local: 1,
          remote: 1
        }
      }
      this.pouch.db.put(clone(was), (err, inserted) => {
        should.not.exist(err)
        was._rev = inserted.rev
        return this.merge.moveFile(this.side, doc, clone(was), err => {
          should.not.exist(err)
          return this.pouch.db.get(doc._id, function (err, res) {
            should.not.exist(err)
            delete doc.localPath
            doc.creationDate = doc.creationDate.toISOString()
            res.should.have.properties(doc)
            should.exist(res.creationDate)
            should.exist(res.size)
            should.exist(res.class)
            should.exist(res.mime)
            done()
          })
        }
                )
      }
            )
    })

    it('adds a hint for writers to know that it is a move', function (done) {
      this.merge.ensureParentExist = sinon.stub().yields(null)
      let doc = {
        _id: 'FOO/NEW-HINT',
        path: 'FOO/NEW-HINT',
        checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517',
        docType: 'file',
        creationDate: new Date(),
        lastModification: new Date(),
        tags: ['courge', 'quux']
      }
      let was = {
        _id: 'FOO/OLD-HINT',
        path: 'FOO/OLD-HINT',
        checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517',
        docType: 'file',
        creationDate: new Date(),
        lastModification: new Date(),
        tags: ['courge', 'quux'],
        sides: {
          local: 1,
          remote: 1
        }
      }
      let opts = {
        include_docs: true,
        live: true,
        since: 'now'
      }
      this.pouch.db.put(clone(was), (err, inserted) => {
        should.not.exist(err)
        was._rev = inserted.rev
        this.pouch.db.changes(opts).on('change', function (info) {
          this.cancel()
          info.id.should.equal(was._id)
          info.doc.moveTo.should.equal(doc._id)
          done()
        })
        this.merge.moveFile(this.side, clone(doc), clone(was), err => should.not.exist(err))
      }
            )
    })
  })

  describe('moveFolder', function () {
    it('saves the new folder and deletes the old one', function (done) {
      this.merge.ensureParentExist = sinon.stub().yields(null)
      let doc = {
        _id: 'FOOBAR/NEW',
        path: 'FOOBAR/NEW',
        docType: 'folder',
        creationDate: new Date(),
        lastModification: new Date(),
        tags: ['courge', 'quux']
      }
      let was = {
        _id: 'FOOBAR/OLD',
        path: 'FOOBAR/OLD',
        docType: 'folder',
        creationDate: new Date(),
        lastModification: new Date(),
        tags: ['courge', 'quux'],
        sides: {
          local: 1,
          remote: 1
        }
      }
      this.pouch.db.put(clone(was), (err, inserted) => {
        should.not.exist(err)
        was._rev = inserted.rev
        return this.merge.moveFolder(this.side, clone(doc), clone(was), err => {
          should.not.exist(err)
          return this.pouch.db.get(doc._id, (err, res) => {
            should.not.exist(err)
            for (let date of ['creationDate', 'lastModification']) {
              doc[date] = doc[date].toISOString()
            }
            res.should.have.properties(doc)
            res.sides.local.should.equal(1)
            return this.pouch.db.get(was._id, function (err, res) {
              should.exist(err)
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

    it('adds a hint for writers to know that it is a move', function (done) {
      this.merge.ensureParentExist = sinon.stub().yields(null)
      let doc = {
        _id: 'FOOBAR/NEW-HINT',
        path: 'FOOBAR/NEW-HINT',
        docType: 'folder',
        creationDate: new Date(),
        lastModification: new Date(),
        tags: ['courge', 'quux']
      }
      let was = {
        _id: 'FOOBAR/OLD-HINT',
        path: 'FOOBAR/OLD-HINT',
        docType: 'folder',
        creationDate: new Date(),
        lastModification: new Date(),
        tags: ['courge', 'quux'],
        sides: {
          local: 1,
          remote: 1
        }
      }
      let opts = {
        include_docs: true,
        live: true,
        since: 'now'
      }
      this.pouch.db.put(clone(was), (err, inserted) => {
        should.not.exist(err)
        was._rev = inserted.rev
        this.pouch.db.changes(opts).on('change', function (info) {
          this.cancel()
          info.id.should.equal(was._id)
          info.doc.moveTo.should.equal(doc._id)
          done()
        })
        this.merge.moveFolder(this.side, clone(doc), clone(was), err => should.not.exist(err))
      }
            )
    })
  })

  describe('moveFolderRecursively', function () {
    before(function (done) {
      return pouchHelpers.createParentFolder(this.pouch, () => {
        return pouchHelpers.createFolder(this.pouch, 9, () => {
          return pouchHelpers.createFile(this.pouch, 9, done)
        }
                )
      }
            )
    })

    it('move the folder and files/folders inside it', function (done) {
      let doc = {
        _id: 'DESTINATION',
        path: 'DESTINATION',
        docType: 'folder',
        creationDate: new Date(),
        lastModification: new Date(),
        tags: []
      }
      this.pouch.db.get('my-folder', (err, was) => {
        should.not.exist(err)
        return this.merge.moveFolderRecursively(doc, was, err => {
          should.not.exist(err)
          let ids = ['', '/folder-9', '/file-9']
          return async.eachSeries(ids, (id, next) => {
            return this.pouch.db.get(`DESTINATION${id}`, (err, res) => {
              should.not.exist(err)
              should.exist(res)
              return this.pouch.db.get(`my-folder${id}`, function (err, res) {
                err.status.should.equal(404)
                return next()
              })
            }
                        )
          }
                    , done)
        }
                )
      }
            )
    })
  })

  describe('deleteFile', () =>
        it('deletes a file', function (done) {
          let doc = {
            _id: 'TO-DELETE/FILE',
            path: 'TO-DELETE/FILE',
            docType: 'file',
            sides: {
              local: 1
            }
          }
          this.pouch.db.put(doc, err => {
            should.not.exist(err)
            return this.merge.deleteFile(this.side, doc, err => {
              should.not.exist(err)
              return this.pouch.db.get(doc._id, function (err) {
                err.status.should.equal(404)
                done()
              })
            }
                )
          }
            )
        })
    )

  describe('deleteFolder', function () {
    it('deletes a folder', function (done) {
      let doc = {
        _id: 'TO-DELETE/FOLDER',
        path: 'TO-DELETE/FOLDER',
        docType: 'folder',
        sides: {
          local: 1
        }
      }
      this.pouch.db.put(doc, err => {
        should.not.exist(err)
        return this.merge.deleteFolder(this.side, doc, err => {
          should.not.exist(err)
          return this.pouch.db.get(doc._id, function (err, res) {
            err.status.should.equal(404)
            done()
          })
        }
                )
      }
            )
    })

    it('remove files in the folder', function (done) {
      let doc = {
        _id: 'FOO/TO-REMOVE',
        path: 'FOO/TO-REMOVE',
        docType: 'folder',
        sides: {
          local: 1
        }
      }
      this.pouch.db.put(doc, err => {
        should.not.exist(err)
        return async.eachSeries(['baz', 'qux', 'quux'], (name, next) => {
          let file = {
            _id: `FOO/TO-REMOVE/${name}`,
            path: `FOO/TO-REMOVE/${name}`,
            docType: 'file'
          }
          return this.pouch.db.put(file, next)
        }
                , err => {
                  should.not.exist(err)
                  return this.merge.deleteFolder(this.side, doc, err => {
                    should.not.exist(err)
                    return this.pouch.byPath('FOO/TO-REMOVE', function (_, docs) {
                      docs.length.should.be.equal(0)
                      done()
                    })
                  }
                    )
                }
                )
      }
            )
    })

    it('remove nested folders', function (done) {
      let base = 'NESTED/TO-DELETE'
      return async.eachSeries(['', '/b', '/b/c', '/b/d'], (name, next) => {
        let doc = {
          _id: `${base}${name}`,
          path: `${base}${name}`,
          docType: 'folder',
          sides: {
            local: 1
          }
        }
        return this.pouch.db.put(doc, next)
      }
            , err => {
              should.not.exist(err)
              return this.merge.deleteFolder(this.side, {_id: base, path: base}, err => {
                should.not.exist(err)
                return this.pouch.db.allDocs(function (err, res) {
                  should.not.exist(err)
                  for (let row of Array.from(res.rows)) {
                    row.id.should.not.match(/^NESTED/i)
                  }
                  done()
                })
              }
                )
            }
            )
    })
  })
})
