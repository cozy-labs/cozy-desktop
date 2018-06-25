/* eslint-env mocha */

const async = require('async')
const _ = require('lodash')
const { clone, pick } = _
const path = require('path')
const sinon = require('sinon')
const should = require('should')

const Merge = require('../../core/merge')
const metadata = require('../../core/metadata')

const configHelpers = require('../support/helpers/config')
const pouchHelpers = require('../support/helpers/pouch')
const MetadataBuilders = require('../support/builders/metadata')

describe('Merge', function () {
  let builders

  before('instanciate config', configHelpers.createConfig)
  before('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('instanciate merge', function () {
    this.side = 'local'
    this.merge = new Merge(this.pouch)
    builders = new MetadataBuilders(this.pouch)
  })
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('addFile', function () {
    it('saves the new file', function (done) {
      let doc = {
        _id: metadata.id('foo/new-file'),
        path: 'foo/new-file',
        md5sum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc',
        docType: 'file',
        updated_at: new Date(),
        tags: ['courge', 'quux']
      }
      this.merge.addFileAsync(this.side, doc).then(() => {
        this.pouch.db.get(doc._id, function (err, res) {
          should.not.exist(err)
          doc.updated_at = doc.updated_at.toISOString()
          res.should.have.properties(doc)
          res.sides.local.should.equal(1)
          done()
        })
      })
    })

    describe('when a file with the same path exists', function () {
      before('create a file', function (done) {
        this.file = {
          _id: 'BUZZ.JPG',
          path: 'BUZZ.JPG',
          docType: 'file',
          md5sum: '1111111111111111111111111111111111111111',
          updated_at: new Date(),
          tags: ['foo'],
          size: 12345,
          class: 'image',
          mime: 'image/jpeg',
          ino: 123
        }
        this.pouch.db.put(this.file, done)
      })

      it('can update the metadata', function (done) {
        let was = clone(this.file)
        this.file.tags = ['bar', 'baz']
        this.file.updated_at = new Date()
        let doc = clone(this.file)
        delete doc.size
        delete doc.class
        delete doc.mime
        delete doc.ino
        this.file.updated_at = doc.updated_at.toISOString()
        this.merge.addFileAsync(this.side, doc).then(() => {
          this.pouch.db.get(doc._id, (err, res) => {
            should.not.exist(err)
            res.should.have.properties(this.file)
            res.size.should.equal(was.size)
            res.class.should.equal(was.class)
            res.mime.should.equal(was.mime)
            res.sides.local.should.equal(2)
            res.ino.should.equal(was.ino)
            done()
          })
        })
      })
    })
  })

  describe('updateFile', () => {
    before('create a file', async function () {
      this.file = {
        _id: 'FIZZBUZZ.JPG',
        path: 'FIZZBUZZ.JPG',
        docType: 'file',
        md5sum: '1111111111111111111111111111111111111111',
        updated_at: new Date(),
        tags: ['foo'],
        size: 12345,
        class: 'image',
        mime: 'image/jpeg',
        ino: 3456
      }
      await this.pouch.db.put(this.file)
    })

    it('creates the file if it does not exist', async function () {
      let doc = {
        _id: 'FOOBAR/NEW-FILE',
        path: 'FOOBAR/NEW-FILE',
        md5sum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc',
        docType: 'file',
        updated_at: new Date(),
        tags: ['courge', 'quux']
      }
      await this.merge.updateFileAsync(this.side, doc)
      const res = await this.pouch.db.get(doc._id)
      doc.updated_at = doc.updated_at.toISOString()
      res.should.have.properties(doc)
      res.sides.local.should.equal(1)
    })

    it('updates the metadata when content is the same', async function () {
      let was = clone(this.file)
      this.file.tags = ['bar', 'baz']
      this.file.updated_at = new Date()
      let doc = clone(this.file)
      delete doc.size
      delete doc.class
      delete doc.mime
      delete doc.ino
      this.file.updated_at = doc.updated_at.toISOString()
      await this.merge.updateFileAsync(this.side, doc)
      const res = await this.pouch.db.get(doc._id)
      res.should.have.properties(this.file)
      res.size.should.equal(was.size)
      res.class.should.equal(was.class)
      res.mime.should.equal(was.mime)
      res.ino.should.equal(was.ino)
      res.sides.local.should.equal(2)
    })

    it('overwrite the content when it was changed', async function () {
      let doc = {
        _id: 'FIZZBUZZ.JPG',
        path: 'FIZZBUZZ.JPG',
        docType: 'file',
        md5sum: '3333333333333333333333333333333333333333',
        tags: ['qux', 'quux'],
        sides: {
          local: 2,
          remote: 2
        }
      }
      await this.merge.updateFileAsync(this.side, clone(doc))
      const res = await this.pouch.db.get(this.file._id)
      res.should.have.properties(doc)
      should.not.exist(res.size)
      should.not.exist(res.class)
      should.not.exist(res.mime)
      res.sides.local.should.equal(3)
    })
  })

  describe('putFolder', () =>
    it('saves the new folder', function (done) {
      let doc = {
        _id: 'FOO/NEW-FOLDER',
        path: 'FOO/NEW-FOLDER',
        docType: 'folder',
        updated_at: new Date(),
        tags: ['courge', 'quux']
      }
      this.merge.putFolderAsync(this.side, doc).then(() => {
        doc.updated_at = doc.updated_at.toISOString()
        this.pouch.db.get(doc._id, function (err, res) {
          should.not.exist(err)
          res.should.have.properties(doc)
          res.sides.local.should.equal(1)
          done()
        })
      })
    })
  )

  describe('moveFile', function () {
    // @TODO fixme intermittent failure
    //  `expected Object {...} } to have property updated_at of
    //  '2017-08-28T08:42:52.535Z' (got '2017-08-28T08:42:52.536Z')`
    //   → https://travis-ci.org/cozy-labs/cozy-desktop/jobs/269106206#L1140
    //   → https://travis-ci.org/cozy-labs/cozy-desktop/jobs/273292815#L1163
    it('saves the new file and deletes the old one', function (done) {
      let doc = {
        _id: 'FOO/NEW',
        path: 'FOO/NEW',
        md5sum: 'ba1368789cce95b574dec70dfd476e61cbf00517',
        docType: 'file',
        updated_at: new Date(),
        tags: ['courge', 'quux']
      }
      let was = {
        _id: 'FOO/OLD',
        path: 'FOO/OLD',
        md5sum: 'ba1368789cce95b574dec70dfd476e61cbf00517',
        docType: 'file',
        updated_at: new Date(),
        tags: ['courge', 'quux'],
        sides: {
          local: 1,
          remote: 1
        },
        trashed: true
      }
      this.pouch.db.put(clone(was), (err, inserted) => {
        should.not.exist(err)
        was._rev = inserted.rev
        this.merge.moveFileAsync(this.side, clone(doc), clone(was)).then(() => {
          this.pouch.db.get(doc._id, (err, res) => {
            should.not.exist(err)
            doc.updated_at = doc.updated_at.toISOString()
            res.should.have.properties(doc)
            res.sides.local.should.equal(1)
            should.not.exist(res.trashed)
            this.pouch.db.get(was._id, function (err, res) {
              should.exist(err)
              err.status.should.equal(404)
              done()
            })
          })
        })
      })
    })

    it('adds missing fields', function (done) {
      let doc = {
        _id: 'FOO/NEW-MISSING-FIELDS.JPG',
        path: 'FOO/NEW-MISSING-FIELDS.JPG',
        md5sum: 'ba1368789cce95b574dec70dfd476e61cbf00517'
      }
      let was = {
        _id: 'FOO/OLD-MISSING-FIELDS.JPG',
        path: 'FOO/OLD-MISSING-FIELDS.JPG',
        md5sum: 'ba1368789cce95b574dec70dfd476e61cbf00517',
        docType: 'file',
        updated_at: new Date(),
        tags: ['courge', 'quux'],
        size: 5426,
        class: 'image',
        mime: 'image/jpeg',
        ino: 3854,
        sides: {
          local: 1,
          remote: 1
        }
      }
      this.pouch.db.put(clone(was), (err, inserted) => {
        should.not.exist(err)
        was._rev = inserted.rev
        this.merge.moveFileAsync(this.side, clone(doc), clone(was)).then(() => {
          this.pouch.db.get(doc._id, function (err, res) {
            should.not.exist(err)
            res.should.have.properties(doc)
            should.exist(res.size)
            should.exist(res.class)
            should.exist(res.mime)
            should.exist(res.ino)
            done()
          })
        })
      })
    })

    it('adds a hint for writers to know that it is a move', function (done) {
      let doc = {
        _id: 'FOO/NEW-HINT',
        path: 'FOO/NEW-HINT',
        md5sum: 'ba1368789cce95b574dec70dfd476e61cbf00517',
        docType: 'file',
        updated_at: new Date(),
        tags: ['courge', 'quux']
      }
      let was = {
        _id: 'FOO/OLD-HINT',
        path: 'FOO/OLD-HINT',
        md5sum: 'ba1368789cce95b574dec70dfd476e61cbf00517',
        docType: 'file',
        updated_at: new Date(),
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
        this.merge.moveFileAsync(this.side, clone(doc), clone(was))
          .catch(err => should.not.exist(err))
      })
    })
  })

  describe('moveFolder', function () {
    // @TODO fixme intermittent failure
    // `Error in .on("change", function): {
    // AssertionError: expected 'FOOBAR/OLD' to be 'FOOBAR/OLD-HINT'`
    // → https://travis-ci.org/cozy-labs/cozy-desktop/jobs/269106208#L2224
    it('saves the new folder and deletes the old one', function (done) {
      let doc = {
        _id: 'FOOBAR/NEW',
        path: 'FOOBAR/NEW',
        docType: 'folder',
        updated_at: new Date(),
        tags: ['courge', 'quux']
      }
      let was = {
        _id: 'FOOBAR/OLD',
        path: 'FOOBAR/OLD',
        docType: 'folder',
        updated_at: new Date(),
        tags: ['courge', 'quux'],
        sides: {
          local: 1,
          remote: 1
        },
        ino: 666,
        trashed: true
      }
      this.pouch.db.put(clone(was), (err, inserted) => {
        should.not.exist(err)
        was._rev = inserted.rev
        this.merge.moveFolderAsync(this.side, clone(doc), clone(was)).then(() => {
          this.pouch.db.get(doc._id, (err, res) => {
            should.not.exist(err)
            doc.updated_at = doc.updated_at.toISOString()
            res.should.have.properties(doc)
            res.sides.local.should.equal(1)
            res.should.have.property('ino', was.ino)
            should.not.exist(res.trashed)
            this.pouch.db.get(was._id, function (err, res) {
              should.exist(err)
              err.status.should.equal(404)
              done()
            })
          })
        })
      })
    })

    it('adds a hint for writers to know that it is a move', function (done) {
      let doc = {
        _id: 'FOOBAR/NEW-HINT',
        path: 'FOOBAR/NEW-HINT',
        docType: 'folder',
        updated_at: new Date(),
        tags: ['courge', 'quux']
      }
      let was = {
        _id: 'FOOBAR/OLD-HINT',
        path: 'FOOBAR/OLD-HINT',
        docType: 'folder',
        updated_at: new Date(),
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
        this.merge.moveFolderAsync(this.side, clone(doc), clone(was))
          .catch(err => should.not.exist(err))
      })
    })
  })

  describe('moveFolderRecursively', function () {
    before(function (done) {
      pouchHelpers.createParentFolder(this.pouch, () => {
        pouchHelpers.createFolder(this.pouch, 9, () => {
          pouchHelpers.createFile(this.pouch, 9, () => {
            this.pouch.db.get(metadata.id(path.normalize('my-folder/file-9')), (err, file) => {
              should.not.exist(err)
              this.pouch.db.put(_.defaults({trashed: true}, file), done)
            })
          })
        })
      })
    })

    it('move the folder and files/folders inside it', function (done) {
      let doc = {
        _id: 'DESTINATION',
        path: 'DESTINATION',
        docType: 'folder',
        updated_at: new Date(),
        tags: []
      }
      this.pouch.db.get(metadata.id('my-folder'), (err, was) => {
        should.not.exist(err)
        this.merge.moveFolderRecursivelyAsync('local', doc, was).then(() => {
          let ids = ['', path.normalize('/folder-9'), path.normalize('/file-9')]
          async.eachSeries(ids, (id, next) => {
            this.pouch.db.get(metadata.id(`DESTINATION${id}`), (err, res) => {
              should.not.exist(err)
              should.exist(res)
              should(res.path).eql(`DESTINATION${id}`)
              should.not.exist(res.trashed)
              if (id !== '') { // parent sides are updated in moveFolderAsync()
                should(res.sides.local).not.eql(1)
              }
              this.pouch.db.get(metadata.id(`my-folder${id}`), function (err, res) {
                err.status.should.equal(404)
                next()
              })
            })
          }, done)
        })
      })
    })
  })

  describe('trashFolderAsync', () => {
    it('does not trash a folder if the other side has added a new file in it', async function () {
      const dir = await builders.dir().path('trashed-folder').trashed().create()
      await builders.file().path(path.normalize('trashed-folder/file')).notUpToDate().create()
      const was = pick(dir, ['_id', 'path', 'docType', 'trashed'])
      const doc = _.defaults({
        path: `.cozy_trash/${was.path}`
      }, was)

      await this.merge.trashFolderAsync(this.side, was, doc)

      const saved = await this.pouch.db.get(was._id)
      should(saved).not.have.property('trashed')
      should(saved.sides).deepEqual({remote: 2})
    })
  })

  describe('deleteFile', () =>
    it('deletes a file', function (done) {
      let doc = {
        _id: path.normalize('TO-DELETE/FILE'),
        path: path.normalize('TO-DELETE/FILE'),
        docType: 'file',
        sides: {
          local: 1
        }
      }
      this.pouch.db.put(doc, err => {
        should.not.exist(err)
        this.merge.deleteFileAsync(this.side, doc).then(() => {
          this.pouch.db.get(doc._id, function (err) {
            err.status.should.equal(404)
            done()
          })
        })
      })
    })
  )

  describe('deleteFolder', function () {
    it('deletes a folder', function (done) {
      let doc = {
        _id: path.normalize('TO-DELETE/FOLDER'),
        path: path.normalize('TO-DELETE/FOLDER'),
        docType: 'folder',
        sides: {
          local: 1
        }
      }
      this.pouch.db.put(doc, err => {
        should.not.exist(err)
        this.merge.deleteFolderAsync(this.side, doc).then(() => {
          should.not.exist(err)
          this.pouch.db.get(doc._id, function (err, res) {
            err.status.should.equal(404)
            done()
          })
        })
      })
    })

    it('remove files in the folder', function (done) {
      let doc = {
        _id: path.normalize('FOO/TO-REMOVE'),
        path: path.normalize('FOO/TO-REMOVE'),
        docType: 'folder',
        sides: {
          local: 1
        }
      }
      this.pouch.db.put(doc, err => {
        should.not.exist(err)
        async.eachSeries(['baz', 'qux', 'quux'], (name, next) => {
          let file = {
            _id: path.normalize(`FOO/TO-REMOVE/${name}`),
            path: path.normalize(`FOO/TO-REMOVE/${name}`),
            docType: 'file'
          }
          this.pouch.db.put(file, next)
        }, err => {
          should.not.exist(err)
          this.merge.deleteFolderAsync(this.side, doc).then(() => {
            this.pouch.byPath(path.normalize('FOO/TO-REMOVE'), function (_, docs) {
              docs.length.should.be.equal(0)
              done()
            })
          })
        })
      })
    })

    it('remove nested folders', function (done) {
      let base = path.normalize('NESTED/TO-DELETE')
      async.eachSeries(['', '/b', '/b/c', '/b/d'], (name, next) => {
        let doc = {
          _id: path.normalize(`${base}${name}`),
          path: path.normalize(`${base}${name}`),
          docType: 'folder',
          sides: {
            local: 1
          }
        }
        this.pouch.db.put(doc, next)
      }, err => {
        should.not.exist(err)
        this.merge.deleteFolderAsync(this.side, {_id: base, path: base}).then(() => {
          this.pouch.db.allDocs(function (err, res) {
            should.not.exist(err)
            for (let row of Array.from(res.rows)) {
              row.id.should.not.match(/^NESTED/i)
            }
            done()
          })
        })
      })
    })
  })

  xdescribe('trashAsync', () => {
    context('when metadata are found in Pouch', () => {
      it('updates it with trashed property and up-to-date sides info', async function () {
        const doc = {_id: 'existing-metadata'}
        await this.pouch.db.put(_.defaults({sides: {local: 1, remote: 1}}, doc))

        await this.merge.trashAsync(this.side, doc)

        const updated = await this.pouch.db.get(doc._id)
        should(updated).have.properties(_.defaults({
          trashed: true,
          sides: {
            local: 2,
            remote: 1
          }
        }, doc))
      })
    })

    context('when metadata are not found in Pouch', () => {
      it('does nothing', async function () {
        const doc = {_id: 'missing-metadata'}

        await this.merge.trashAsync(this.side, doc)

        await should(this.pouch.db.get(doc._id))
          .be.rejectedWith({status: 404})
      })
    })

    context('when docType does not match', () => {
      it('tries to resolve the conflict', async function () {
        this.merge.local = {resolveConflictAsync: sinon.stub()}
        this.merge.local.resolveConflictAsync.returnsPromise().resolves()
        sinon.spy(this.pouch, 'put')

        const doc = {_id: 'conflicting-doctype', docType: 'folder', path: 'conflicting-doctype'}
        await this.pouch.db.put(_.defaults({docType: 'file'}, doc))

        await this.merge.trashAsync(this.side, doc)

        should(this.merge.local.resolveConflictAsync).have.been.calledOnce()
        should(this.pouch.put).not.have.been.called()
        const [dst, src] = this.merge.local.resolveConflictAsync.getCall(0).args
        should(src).eql(doc)
        should(dst).have.properties(_.defaults({path: dst.path}, doc))
        should(dst.path).match(/conflict/)
        should(dst).not.have.property('trashed')

        this.pouch.put.restore()
      })
    })
  })
})
