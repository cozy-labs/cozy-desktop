/* eslint-env mocha */

const _ = require('lodash')
const { clone, pick } = _
const path = require('path')
const sinon = require('sinon')
const should = require('should')

const Merge = require('../../core/merge')
const metadata = require('../../core/metadata')

const configHelpers = require('../support/helpers/config')
const {
  onPlatform,
  onPlatforms
} = require('../support/helpers/platform')
const pouchHelpers = require('../support/helpers/pouch')
const dbBuilders = require('../support/builders/db')
const MetadataBuilders = require('../support/builders/metadata')

/** Returns an object describing the side-effects of a Merge.
 *
 * The returned object has the following properties:
 *
 * - `savedDocs`: Which docs were passed to `Pouch#put()`
 * - `resolvedConflicts`: Which conflits were resolved on which side
 *
 * The given `Merge` instance is expected to have its `#resolveConflictAsync()`
 * method wrapped with `sinon.spy()`.
 * The given `Pouch` instance is expected to have its `#put()` method spied in
 * the same way.
 *
 * FIXME: `Pouch#bulkDocs()` are not yet included in `mergeSideEffects()`.
 * FIXME: `Pouch#remove()` is not yet included in `mergeSideEffects()`.
 */
function mergeSideEffects ({merge, pouch} /*: * */) {
  return {
    savedDocs: pouch.put.args.map(_.first),
    resolvedConflicts: merge.resolveConflictAsync.args.map(([side, doc, existing]) =>
      [
        side,
        // Include only properties that are relevant in conflict resolution:
        _.pick(doc, [
          // The path is necessary to:
          // - generate the new file/dir name including the conflict suffix.
          // - rename the conflicting file/dir on the local side.
          'path',
          // The remote._id is necessary to rename the conflicting file/dir on
          // the remote side. Actually the remote._rev is not used although
          // we're currently including it in the test-asserted data as part of
          // the remote property.
          'remote'
        ])
        // Don't include the existing version: it is only useful for
        // logging / debugging and has no impact on conflict resolution.
      ]
    )
  }
}

describe('Merge', function () {
  let builders

  before('instanciate config', configHelpers.createConfig)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('instanciate merge', function () {
    this.side = 'local'
    this.merge = new Merge(this.pouch)
    this.merge.local = {renameConflictingDocAsync: sinon.stub().resolves()}
    this.merge.remote = {renameConflictingDocAsync: sinon.stub().resolves()}
    builders = new MetadataBuilders(this.pouch)

    sinon.spy(this.merge, 'resolveConflictAsync')
    // this.pouch.put & bulkDocs must be spied manually because of test data
    // builders. But if spied, it will be restored automatically (see hook
    // below).
  })
  afterEach(function () {
    if (this.pouch.put.restore) this.pouch.put.restore()
    if (this.pouch.bulkDocs.restore) this.pouch.bulkDocs.restore()
  })
  afterEach('clean pouch', pouchHelpers.cleanDatabase)
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
      beforeEach('create a file', async function () {
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

    onPlatforms('win32', 'darwin', () => {
      it('resolves an identity conflict with an existing file', async function () {
        await builders.file().path('bar').create()
        const doc = builders.file().path('BAR').build()
        sinon.spy(this.pouch, 'put')

        await this.merge.addFileAsync(this.side, doc)

        should(this.merge.resolveConflictAsync).have.been.calledWith(this.side, doc)
        should(this.pouch.put).not.have.been.called()
      })
    })

    onPlatforms('linux', () => {
      it('does not have identity conflicts', async function () {
        await builders.file().path('bar').create()
        const doc = builders.file().path('BAR').build()
        sinon.spy(this.pouch, 'put')

        await this.merge.addFileAsync(this.side, doc)

        should(this.merge.resolveConflictAsync).not.have.been.called()
        should(this.pouch.put).have.called()
      })
    })

    it('overrides an unsynced local update with a new one detected by local initial scan', async function () {
      const initialMerge = await builders.file().path('yafile').sides({local: 1}).data('initial content').create()
      const initialSync = await builders.file(initialMerge).sides({local: 2, remote: 2}).create()
      const was = await builders.file(initialSync).sides({local: 3, remote: 2}).data('first update').create()
      const doc = builders.file(was).unmerged('local').data('second update').newerThan(was).build()

      sinon.spy(this.pouch, 'put')
      await this.merge.addFileAsync('local', _.cloneDeep(doc))

      should(mergeSideEffects(this)).deepEqual({
        savedDocs: [
          {
            _id: initialMerge._id,
            _rev: was._rev,
            docType: initialMerge.docType,
            ino: undefined,
            md5sum: doc.md5sum,
            moveFrom: undefined, // FIXME
            path: doc.path,
            remote: was.remote,
            sides: {local: 4, remote: 2},
            size: doc.size,
            tags: was.tags,
            updated_at: doc.updated_at
          }
        ],
        resolvedConflicts: []
      })
    })
  })

  describe('updateFile', () => {
    beforeEach('simulate local merge', async function () {
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
      metadata.markSide('local', this.file)
      const { rev } = await this.pouch.db.put(this.file)
      this.file._rev = rev
    })
    beforeEach('simulate remote sync', async function () {
      this.file.remote = {
        _id: dbBuilders.id(),
        _rev: dbBuilders.rev(1)
      }
      metadata.markAsUpToDate(this.file)
      const { rev } = await this.pouch.db.put(this.file)
      this.file._rev = rev
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
      res.should.have.properties(_.omit(this.file, ['_rev']))
      res.size.should.equal(was.size)
      res.class.should.equal(was.class)
      res.mime.should.equal(was.mime)
      res.ino.should.equal(was.ino)
      res.sides.local.should.equal(3)
    })

    it('overwrite the content when it was changed', async function () {
      let doc = {
        _id: 'FIZZBUZZ.JPG',
        path: 'FIZZBUZZ.JPG',
        docType: 'file',
        md5sum: '3333333333333333333333333333333333333333',
        tags: ['qux', 'quux']
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
      const doc = builders.dir(old).whateverChange().changedSide(this.side).build()

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

    onPlatforms('win32', 'darwin', () => {
      it('resolves an identity conflict with an existing dir', async function () {
        const alfred = await builders.dir().path('alfred').create()
        const Alfred = await builders.dir().path('Alfred').build()

        await this.merge.putFolderAsync(this.side, Alfred)

        should(await this.pouch.db.get(Alfred._id)).deepEqual(alfred)
        should(this.merge.resolveConflictAsync).have.been.calledWith(this.side, Alfred)
      })
    })

    onPlatform('linux', () => {
      it('does not have identity conflicts', async function () {
        const alfred = await builders.dir().path('alfred').create()
        const Alfred = await builders.dir().path('Alfred').build()

        await this.merge.putFolderAsync(this.side, Alfred)

        should(this.merge.resolveConflictAsync).not.have.been.called()
        // Same as Alfred except _rev was added
        should(await this.pouch.db.get(Alfred._id)).have.properties(Alfred)
        should(await this.pouch.db.get(alfred._id)).deepEqual(alfred)
      })
    })
  })

  describe('moveFile', function () {
    it('saves the new file and deletes the old one', async function () {
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
      let doc = {
        _id: 'FOO/NEW',
        path: 'FOO/NEW',
        md5sum: 'ba1368789cce95b574dec70dfd476e61cbf00517',
        docType: 'file',
        updated_at: new Date(),
        tags: ['courge', 'quux']
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
      await builders.dir().path('FOO').create()
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

    it('resolves a conflict with an existing destination', async function () {
      const existing = await builders.file().path('DST_FILE').create()
      const was = await builders.file().path('SRC_FILE').upToDate().create()
      const doc = builders.file(was).path(existing.path).noRev().build()
      sinon.spy(this.pouch, 'bulkDocs')

      await this.merge.moveFileAsync(this.side, _.cloneDeep(doc), _.cloneDeep(was))

      const conflictRenamings = this.merge[this.side].renameConflictingDocAsync.args.map(args => ({
        srcId: _.get(args, [0, '_id']),
        dstId: metadata.id(args[1])
      }))
      const { dstId } = conflictRenamings[0]
      const savedDocs = _.chain(this.pouch.bulkDocs.args)
        .flattenDeep()
        .map(({_id, _deleted, moveFrom, moveTo}) => {
          const doc = {_id}
          if (_deleted) doc._deleted = true
          if (moveFrom) doc.moveFrom = _.pick(moveFrom, ['_id'])
          if (moveTo) doc.moveTo = moveTo
          return doc
        })
        .value()

      should({conflictRenamings, savedDocs}).deepEqual({
        conflictRenamings: [
          {srcId: doc._id, dstId}
        ],
        savedDocs: [
          {_id: was._id, _deleted: true, moveTo: dstId},
          {_id: dstId, moveFrom: {_id: was._id}}
        ]
      })
    })

    it('does not identify an identical renaming as a conflict', async function () {
      const banana = await builders.file().path('banana').upToDate().create()
      const BANANA = _({_id: metadata.id('BANANA'), path: 'BANANA'})
        .defaults(banana)
        .omit(['_rev'])
        .value()

      await this.merge.moveFileAsync(this.side, BANANA, banana)

      should(this.merge.resolveConflictAsync.args).not.have.been.called()
      should(await this.pouch.db.get(BANANA._id)).have.properties(
        _.omit(
          BANANA,
          ['class', 'mime', 'ino']
        )
      )
      if (banana._id !== BANANA._id) {
        await should(this.pouch.db.get(banana._id)).be.rejectedWith({status: 404})
      }
    })

    it('identifies a local move without existing remote side as an addition', async function () {
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
          local: 1
        }
      }
      const inserted = await this.pouch.db.put(clone(was))
      was._rev = inserted.rev
      await this.merge.moveFileAsync('local', clone(doc), clone(was))
      const res = await this.pouch.db.get(doc._id)
      doc.updated_at = doc.updated_at.toISOString()
      res.should.have.properties(doc)
      res.sides.local.should.equal(1)
      should(res.moveFrom).be.undefined()
      should(res.moveTo).be.undefined()
      await should(this.pouch.db.get(was._id)).be.rejectedWith({status: 404})
    })

    onPlatforms('win32', 'darwin', () => {
      it('resolves an identity conflict with an existing file', async function () {
        const identical = await builders.file().path('QUX').create()
        const was = builders.file().path('baz').upToDate().build()
        const doc = _.defaults({_id: identical._id, path: 'qux'}, was)
        sinon.spy(this.pouch, 'put')
        sinon.spy(this.pouch, 'bulkDocs')

        await this.merge.moveFileAsync(this.side, doc, was)

        should(this.merge.resolveConflictAsync.args).deepEqual([
          [this.side, doc, identical]
        ])
        should(this.pouch.put).not.have.been.called()
        should(this.pouch.bulkDocs).not.have.been.called()
      })
    })

    onPlatform('linux', () => {
      it('does not have identity conflicts', async function () {
        const QUX = await builders.file().path('QUX').create()
        const baz = builders.file().path('baz').upToDate().build()
        const qux = _.defaults({_id: 'qux', path: 'qux'}, baz)
        sinon.spy(this.pouch, 'put')
        sinon.spy(this.pouch, 'bulkDocs')

        await this.merge.moveFileAsync(this.side, qux, baz)

        should(this.merge.resolveConflictAsync).not.have.been.called()
        await should(this.pouch.db.get(baz._id)).be.rejectedWith({status: 404})
        // Same as qux except _rev was added
        should(await this.pouch.db.get(qux._id)).have.properties(
          _.omit(
            qux,
            // FIXME: fields set to undefined
            ['class', 'mime', 'ino']
          )
        )
        should(await this.pouch.db.get(QUX._id)).deepEqual(QUX)
      })
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
      await builders.dir().path('FOOBAR').create()
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

    it('resolves a conflict with an existing destination', async function () {
      const existing = await builders.dir().path('DST_DIR').upToDate().create()
      const was = await builders.dir().path('SRC_DIR').upToDate().create()
      const doc = builders.dir(was).path(existing.path).noRev().build()
      sinon.spy(this.pouch, 'bulkDocs')

      await this.merge.moveFolderAsync(this.side, _.cloneDeep(doc), _.cloneDeep(was))

      const conflictRenamings = this.merge[this.side].renameConflictingDocAsync.args.map(args => ({
        srcId: _.get(args, [0, '_id']),
        dstId: metadata.id(args[1])
      }))
      conflictRenamings.should.have.length(1)
      const { dstId } = conflictRenamings[0]
      const savedDocs = _.chain(this.pouch.bulkDocs.args)
        .flattenDeep()
        .map(({_id, _deleted, moveFrom, moveTo}) => {
          const doc = {_id}
          if (_deleted) doc._deleted = true
          if (moveFrom) doc.moveFrom = _.pick(moveFrom, ['_id'])
          if (moveTo) doc.moveTo = moveTo
          return doc
        })
        .value()

      should({conflictRenamings, savedDocs}).deepEqual({
        conflictRenamings: [
          {srcId: doc.path, dstId}
        ],
        savedDocs: [
          {_id: was._id, _deleted: true, moveTo: dstId},
          {_id: dstId, moveFrom: {_id: was._id}}
        ]
      })
    })

    it('does not create conflict for local-only existing folder.', async function () {
      const existing = await builders.dir().sides({local: 1}).unmerged('local').path('DST_DIR2').create()
      const was = await builders.dir().path('SRC_DIR2').upToDate().create()
      const doc = builders.dir(was).path(existing.path).noRev().build()

      await this.merge.moveFolderAsync(this.side, doc, was)

      should(this.merge.resolveConflictAsync).not.have.been.called()
      const newMetadata = await this.pouch.db.get(existing._id)
      newMetadata.should.have.property('remote')
      newMetadata.remote.should.have.property('_id', was.remote._id)
    })

    it('does not identify an identical renaming as a conflict', async function () {
      const apple = await builders.dir().path('apple').upToDate().create()
      const APPLE = _({_id: metadata.id('APPLE'), path: 'APPLE'})
        .defaults(apple)
        .omit(['_rev'])
        .value()

      await this.merge.moveFolderAsync(this.side, APPLE, apple)

      should(this.merge.resolveConflictAsync.args).not.have.been.called()
      should(await this.pouch.db.get(APPLE._id)).have.properties(
        _.omit(
          APPLE,
          ['ino']
        )
      )
      if (apple._id !== APPLE._id) {
        await should(this.pouch.db.get(apple._id)).be.rejectedWith({status: 404})
      }
    })

    onPlatforms('win32', 'darwin', () => {
      it('resolves an identity conflict with an existing file', async function () {
        const LINUX = await builders.dir().path('LINUX').create()
        const torvalds = builders.dir().path('torvalds').upToDate().build()
        const linux = _.defaults({_id: LINUX._id, path: 'linux'}, torvalds)
        sinon.spy(this.pouch, 'put')
        sinon.spy(this.pouch, 'bulkDocs')

        await this.merge.moveFolderAsync(this.side, linux, torvalds)

        should(this.merge.resolveConflictAsync.args).deepEqual([
          [this.side, linux, LINUX]
        ])
        should(this.pouch.put).not.have.been.called()
        should(this.pouch.bulkDocs).not.have.been.called()
      })
    })

    onPlatform('linux', () => {
      it('does not have identity conflicts', async function () {
        const NUKEM = await builders.dir().path('NUKEM').create()
        const duke = builders.dir().path('duke').upToDate().build()
        const nukem = _.defaults({_id: 'nukem', path: 'nukem'}, duke)
        sinon.spy(this.pouch, 'put')
        sinon.spy(this.pouch, 'bulkDocs')

        await this.merge.moveFolderAsync(this.side, nukem, duke)

        should(this.merge.resolveConflictAsync).not.have.been.called()
        await should(this.pouch.db.get(duke._id)).be.rejectedWith({status: 404})
        should(await this.pouch.db.get(nukem._id))
          .have.properties(_.omit(nukem, ['ino']))
        should(await this.pouch.db.get(NUKEM._id)).deepEqual(NUKEM)
      })
    })

    it('handles overwritten descendants', async function () {
      await builders.file().path('src/file').upToDate().create()
      await builders.file().path('dst/file').upToDate().create()
      const oldDst = builders.dir().path('dst').build()
      const src = await builders.dir().path('src').upToDate().create()
      const dst = builders.dir().path('dst').overwrite(oldDst).build()

      await this.merge.moveFolderAsync(this.side, dst, src)
    })
  })

  describe('moveFolderRecursively', function () {
    beforeEach(async function () {
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

    it('adds an unsynced file to the destination folder', async function () {
      const fileName = 'unsynced-file'
      const srcFolder = await builders.dir().path('ADDED_DIR').upToDate().create()
      await builders.file().path(path.normalize(`${srcFolder.path}/${fileName}`)).sides({ local: 1 }).create()

      const dstFolder = builders.dir(srcFolder).path('MOVED_DIR').sides({}).noRev().build()
      await this.merge.moveFolderRecursivelyAsync('local', dstFolder, srcFolder)

      const movedFile = await this.pouch.db.get(metadata.id(path.normalize(`${dstFolder.path}/${fileName}`)))
      should(movedFile).have.property('path', path.normalize(`${dstFolder.path}/${fileName}`))
      await should(
        this.pouch.db.get(metadata.id(`${srcFolder.path}/{fileName}`))
      ).be.rejectedWith({status: 404})
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
        md5sum: 'BADBEEF',
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
          docType: 'file',
          md5sum: 'BADBEEF'
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
        const doc = {_id: 'conflicting-doctype', docType: 'folder', path: 'conflicting-doctype'}
        await this.pouch.db.put(_.defaults({docType: 'file'}, doc))

        await this.merge.trashAsync(this.side, doc)

        should(this.merge.resolveConflictAsync).have.been.calledWith(this.side, doc)
        should(this.pouch.put).not.have.been.called()
      })
    })
  })
})
