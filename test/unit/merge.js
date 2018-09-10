/* eslint-env mocha */

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
    it('saves the new file', async function () {
      let doc = {
        _id: metadata.id('foo/new-file'),
        path: 'foo/new-file',
        md5sum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc',
        docType: 'file',
        updated_at: new Date(),
        tags: ['courge', 'quux']
      }
      await this.merge.addFileAsync(this.side, doc)
      const res = await this.pouch.db.get(doc._id)
      doc.updated_at = doc.updated_at.toISOString()
      res.should.have.properties(doc)
      res.sides.local.should.equal(1)
    })

    describe('when a file with the same path exists', function () {
      before('create a file', async function () {
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
        await this.pouch.db.put(this.file)
      })

      it('can update the metadata', async function () {
        let was = clone(this.file)
        this.file.tags = ['bar', 'baz']
        this.file.updated_at = new Date()
        let doc = clone(this.file)
        delete doc.size
        delete doc.class
        delete doc.mime
        delete doc.ino
        this.file.updated_at = doc.updated_at.toISOString()
        await this.merge.addFileAsync(this.side, doc)
        const res = await this.pouch.db.get(doc._id)
        res.should.have.properties(this.file)
        res.size.should.equal(was.size)
        res.class.should.equal(was.class)
        res.mime.should.equal(was.mime)
        res.sides.local.should.equal(2)
        res.ino.should.equal(was.ino)
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
        },
        remote: {
          _id: 'XXX',
          _rev: '2-abc'
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

  describe('putFolder', () => {
    it('saves the new folder', async function () {
      let doc = {
        _id: 'FOO/NEW-FOLDER',
        path: 'FOO/NEW-FOLDER',
        docType: 'folder',
        updated_at: new Date(),
        tags: ['courge', 'quux']
      }
      await this.merge.putFolderAsync(this.side, doc)
      doc.updated_at = doc.updated_at.toISOString()
      const res = await this.pouch.db.get(doc._id)
      res.should.have.properties(doc)
      res.sides.local.should.equal(1)
    })

    it('saves a new version of an existing folder', async function () {
      const old = await builders.dir().path('existing-folder').create()
      const doc = builders.changedFrom(old).onSide(this.side).build()

      await this.merge.putFolderAsync(this.side, doc)

      const result = await this.pouch.db.get(doc._id)
      should(result._rev).not.equal(old._rev)
      should(result).have.properties(_.omit(doc, '_rev'))
    })

    it('does nothing when existing folder is up to date', async function () {
      const old = await builders.dir().path('up-to-date-folder').create()
      const doc = _.cloneDeep(old)

      await this.merge.putFolderAsync(this.side, doc)

      const result = await this.pouch.db.get(doc._id)
      should(result).deepEqual(old)
    })
  })

  describe('moveFile', function () {
    // @TODO fixme intermittent failure
    //  `expected Object {...} } to have property updated_at of
    //  '2017-08-28T08:42:52.535Z' (got '2017-08-28T08:42:52.536Z')`
    //   → https://travis-ci.org/cozy-labs/cozy-desktop/jobs/269106206#L1140
    //   → https://travis-ci.org/cozy-labs/cozy-desktop/jobs/273292815#L1163
    it('saves the new file and deletes the old one', async function () {
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
        remote: {_id: 'XXX', _rev: '1-abc'},
        trashed: true
      }
      const inserted = await this.pouch.db.put(clone(was))
      was._rev = inserted.rev
      await this.merge.moveFileAsync(this.side, clone(doc), clone(was))
      const res = await this.pouch.db.get(doc._id)
      doc.updated_at = doc.updated_at.toISOString()
      res.should.have.properties(doc)
      res.sides.local.should.equal(1)
      should.not.exist(res.trashed)
      await should(this.pouch.db.get(was._id)).be.rejectedWith({status: 404})
    })

    it('adds missing fields', async function () {
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
        },
        remote: {_id: 'XXX', _rev: '1-abc'}
      }
      const inserted = await this.pouch.db.put(clone(was))
      was._rev = inserted.rev
      await this.merge.moveFileAsync(this.side, clone(doc), clone(was))
      const res = await this.pouch.db.get(doc._id)
      res.should.have.properties(doc)
      should.exist(res.size)
      should.exist(res.class)
      should.exist(res.mime)
      should.exist(res.ino)
    })

    it('adds a hint for writers to know that it is a move', async function () {
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
        },
        remote: {_id: 'XXX', _rev: '1-abc'}
      }
      let opts = {
        include_docs: true,
        live: true,
        since: 'now'
      }
      const inserted = await this.pouch.db.put(clone(was))
      was._rev = inserted.rev
      const infoPromise = new Promise((resolve, reject) => {
        this.pouch.db.changes(opts).on('change', function (info) {
          this.cancel()
          resolve(info)
        })
      })
      await this.merge.moveFileAsync(this.side, clone(doc), clone(was))
      const info = await infoPromise
      should(info).have.property('id', was._id)
      should(info.doc).have.property('moveTo', doc._id)
    })
  })

  describe('moveFolder', function () {
    // @TODO fixme intermittent failure
    // `Error in .on("change", function): {
    // AssertionError: expected 'FOOBAR/OLD' to be 'FOOBAR/OLD-HINT'`
    // → https://travis-ci.org/cozy-labs/cozy-desktop/jobs/269106208#L2224
    it('saves the new folder and deletes the old one', async function () {
      let doc = {
        _id: 'FOOBAR/NEW',
        path: 'FOOBAR/NEW',
        docType: 'folder',
        updated_at: new Date('2018-09-02T00:00:00.000Z'),
        tags: ['courge', 'quux']
      }
      let was = {
        _id: 'FOOBAR/OLD',
        path: 'FOOBAR/OLD',
        docType: 'folder',
        updated_at: new Date('2018-09-01T00:00:00.000Z'),
        tags: ['courge', 'quux'],
        sides: {
          local: 1,
          remote: 1
        },
        remote: {_id: 'XXX', _rev: '1-abc'},
        ino: 666,
        trashed: true
      }
      const inserted = await this.pouch.db.put(clone(was))
      was._rev = inserted.rev
      await this.merge.moveFolderAsync(this.side, clone(doc), clone(was))
      const res = await this.pouch.db.get(doc._id)
      doc.updated_at = doc.updated_at.toISOString()
      res.should.have.properties(doc)
      res.sides.local.should.equal(1)
      res.should.have.property('ino', was.ino)
      should.not.exist(res.trashed)
      await should(this.pouch.db.get(was._id)).be.rejectedWith({status: 404})
    })

    it('adds a hint for writers to know that it is a move', async function () {
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
        },
        remote: {_id: 'XXX', _rev: '1-abc'}
      }
      let opts = {
        include_docs: true,
        live: true,
        since: 'now'
      }
      const inserted = await this.pouch.db.put(clone(was))
      was._rev = inserted.rev
      const infoPromise = new Promise((resolve, reject) => {
        this.pouch.db.changes(opts).on('change', function (info) {
          this.cancel()
          resolve(info)
        })
      })
      await this.merge.moveFolderAsync(this.side, clone(doc), clone(was))
      const info = await infoPromise
      should(info).have.property('id', was._id)
      should(info.doc).have.property('moveTo', doc._id)
    })
  })

  describe('moveFolderRecursively', function () {
    before(async function () {
      await pouchHelpers.createParentFolder(this.pouch)
      await pouchHelpers.createFolder(this.pouch, 9)
      await pouchHelpers.createFile(this.pouch, 9)
      // FIXME: Test doesn't fail without those two lines
      const file = await this.pouch.db.get(metadata.id(path.normalize('my-folder/file-9')))
      await this.pouch.db.put(_.defaults({trashed: true}, file))
    })

    it('move the folder and files/folders inside it', async function () {
      let doc = {
        _id: 'DESTINATION',
        path: 'DESTINATION',
        docType: 'folder',
        updated_at: new Date(),
        tags: [],
        sides: {
          remote: 1,
          local: 1
        },
        remote: {_id: 'XXX', _rev: '1-abc'}
      }
      const was = await this.pouch.db.get(metadata.id('my-folder'))
      await this.merge.moveFolderRecursivelyAsync('local', doc, was)
      let ids = ['', path.normalize('/folder-9'), path.normalize('/file-9')]
      for (let id of ids) {
        const res = await this.pouch.db.get(metadata.id(`DESTINATION${id}`))
        should.exist(res)
        should(res.path).eql(`DESTINATION${id}`)
        should.not.exist(res.trashed)
        if (id !== '') { // parent sides are updated in moveFolderAsync()
          should(res.sides.local).not.eql(1)
        }
        await should(this.pouch.db.get(metadata.id(`my-folder${id}`)))
          .be.rejectedWith({status: 404})
      }
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
    it('deletes a file', async function () {
      let doc = {
        _id: path.normalize('TO-DELETE/FILE'),
        path: path.normalize('TO-DELETE/FILE'),
        docType: 'file',
        sides: {
          local: 1
        }
      }
      await this.pouch.db.put(doc)
      await this.merge.deleteFileAsync(this.side, doc)
      await should(this.pouch.db.get(doc._id)).be.rejectedWith({status: 404})
    })
  )

  describe('deleteFolder', function () {
    it('deletes a folder', async function () {
      let doc = {
        _id: path.normalize('TO-DELETE/FOLDER'),
        path: path.normalize('TO-DELETE/FOLDER'),
        docType: 'folder',
        sides: {
          local: 1
        }
      }
      await this.pouch.db.put(doc)
      await this.merge.deleteFolderAsync(this.side, doc)
      await should(this.pouch.db.get(doc._id)).be.rejectedWith({status: 404})
    })

    it('remove files in the folder', async function () {
      let doc = {
        _id: path.normalize('FOO/TO-REMOVE'),
        path: path.normalize('FOO/TO-REMOVE'),
        docType: 'folder',
        sides: {
          local: 1
        }
      }
      await this.pouch.db.put(doc)
      for (let name of ['baz', 'qux', 'quux']) {
        let file = {
          _id: path.normalize(`FOO/TO-REMOVE/${name}`),
          path: path.normalize(`FOO/TO-REMOVE/${name}`),
          docType: 'file'
        }
        await this.pouch.db.put(file)
      }
      await this.merge.deleteFolderAsync(this.side, doc)
      const docs = await this.pouch.byPathAsync(path.normalize('FOO/TO-REMOVE'))
      docs.length.should.be.equal(0)
    })

    it('remove nested folders', async function () {
      let base = path.normalize('NESTED/TO-DELETE')
      for (let name of ['', '/b', '/b/c', '/b/d']) {
        let doc = {
          _id: path.normalize(`${base}${name}`),
          path: path.normalize(`${base}${name}`),
          docType: 'folder',
          sides: {
            local: 1
          }
        }
        await this.pouch.db.put(doc)
      }
      await this.merge.deleteFolderAsync(this.side, {_id: base, path: base})
      const res = await this.pouch.db.allDocs()
      for (let row of Array.from(res.rows)) {
        row.id.should.not.match(/^NESTED/i)
      }
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
