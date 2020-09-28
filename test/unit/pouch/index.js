/* eslint-env mocha */

const Promise = require('bluebird')
const path = require('path')
const should = require('should')
const sinon = require('sinon')
const _ = require('lodash')

const metadata = require('../../../core/metadata')
const migrations = require('../../../core/pouch/migrations')

const Builders = require('../../support/builders')
const configHelpers = require('../../support/helpers/config')
const pouchHelpers = require('../../support/helpers/pouch')

describe('Pouch', function() {
  before('instanciate config', configHelpers.createConfig)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  afterEach('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  let createdDocs
  beforeEach('create folders and files', async function() {
    createdDocs = [await pouchHelpers.createParentFolder(this.pouch)]
    for (let i of [1, 2, 3]) {
      createdDocs.push(
        await pouchHelpers.createFolder(
          this.pouch,
          path.join('my-folder', `folder-${i}`)
        )
      )
      createdDocs.push(
        await pouchHelpers.createFile(
          this.pouch,
          path.join('my-folder', `file-${i}`)
        )
      )
    }
  })

  describe('lock', () => {
    it('ensures nobody else accesses Pouch until released', async function() {
      const promiseLock1 = this.pouch.lock('lock1')
      await should(promiseLock1).be.fulfilled()
      const releaseLock1 = promiseLock1.value()
      const promiseLock2 = this.pouch.lock('lock2')
      const promiseLock3 = this.pouch.lock('lock3')
      should(promiseLock2.isPending()).be.true()
      should(promiseLock3.isPending()).be.true()
      releaseLock1()
      should(promiseLock3.isPending()).be.true()
      await should(promiseLock2).be.fulfilled()
      const releaseLock2 = promiseLock2.value()
      should(promiseLock3.isPending()).be.true()
      releaseLock2()
      await should(promiseLock3).be.fulfilled()
      const releaseLock3 = promiseLock2.value()
      releaseLock3()
    })
  })

  describe('runMigrations', () => {
    let currentSchemaVersion, availableMigrations
    beforeEach('create migrations', async function() {
      currentSchemaVersion = await migrations.currentSchemaVersion(
        this.pouch.db
      )
      availableMigrations /*: Migration[] */ = [
        {
          baseSchemaVersion: currentSchemaVersion,
          targetSchemaVersion: currentSchemaVersion + 1,
          description: 'Test migration 1',
          affectedDocs: docs => docs,
          run: docs =>
            docs.map(doc => ({
              ...doc,
              migration1: true
            }))
        },
        {
          baseSchemaVersion: currentSchemaVersion + 1,
          targetSchemaVersion: currentSchemaVersion + 2,
          description: 'Test migration 2',
          affectedDocs: docs => docs,
          run: docs =>
            docs.map(doc => ({
              ...doc,
              migration2: true
            }))
        },
        {
          baseSchemaVersion: currentSchemaVersion + 2,
          targetSchemaVersion: currentSchemaVersion + 3,
          description: 'Test migration 3',
          affectedDocs: docs => docs,
          run: docs =>
            docs.map(doc => ({
              ...doc,
              migration3: true
            }))
        }
      ]
    })

    it('runs all given migrations', async function() {
      await this.pouch.runMigrations(availableMigrations)

      const docs = await this.pouch.byRecursivePath('')
      should(docs).matchEach(doc => {
        should(doc.migration1).be.true()
        should(doc.migration2).be.true()
        should(doc.migration3).be.true()
      })
    })

    it('retries failed migrations', async function() {
      let calls = 0
      const migrationFailingOnce = {
        baseSchemaVersion: availableMigrations[1].baseSchemaVersion,
        targetSchemaVersion: availableMigrations[1].targetSchemaVersion,
        description: 'Test migration 2',
        affectedDocs: docs => docs,
        run: docs => {
          const migratedDocs = docs.map(doc => ({
            ...doc,
            migration2: true,
            _rev: calls === 0 ? doc._rev.replace(/\d/, '9') : doc._rev
          }))
          calls++
          return migratedDocs
        }
      }
      sinon.spy(migrationFailingOnce, 'run')
      availableMigrations.splice(1, 1, migrationFailingOnce)

      await this.pouch.runMigrations(availableMigrations)

      should(migrationFailingOnce.run).have.been.calledTwice()
      const docs = await this.pouch.byRecursivePath('')
      should(docs).matchEach(doc => {
        should(doc.migration1).be.true()
        should(doc.migration2).be.true()
        should(doc.migration3).be.true()
      })
    })

    it('throws a MigrationFailedError in case both attempts failed', async function() {
      const migrationFailing = {
        baseSchemaVersion: availableMigrations[1].baseSchemaVersion,
        targetSchemaVersion: availableMigrations[1].targetSchemaVersion,
        description: 'Test migration 2',
        affectedDocs: docs => docs,
        run: docs =>
          docs.map(doc => ({
            ...doc,
            migration2: true,
            _rev: doc._rev.replace(/\d/, '9')
          }))
      }
      availableMigrations.splice(1, 1, migrationFailing)

      try {
        await this.pouch.runMigrations(availableMigrations)
        should.fail()
      } catch (err) {
        should(err).be.instanceof(migrations.MigrationFailedError)
        should(err).have.property('message', migrationFailing.description)
      }
      const docs = await this.pouch.byRecursivePath('')
      should(docs).matchEach(doc => {
        should(doc.migration1).be.true()
        should(doc.migration2).be.undefined()
        should(doc.migration3).be.undefined()
      })
    })
  })

  describe('ODM', function() {
    describe('put', () => {
      let doc, old

      beforeEach(async function() {
        const builders = new Builders({ pouch: this.pouch })

        old = await builders
          .metafile()
          .path('doc')
          .create()
        doc = _.clone(old)
      })

      it('does not update doc without sides', async function() {
        _.unset(doc, 'sides')

        await (() => {
          this.pouch.put(doc)
        }).should.throw()
        should((await this.pouch.db.get(doc._id))._rev).equal(old._rev)
      })

      context('when doc is not deleted', () => {
        beforeEach(function() {
          doc._deleted = false
        })

        it('does not update doc with a remote side and no remote', async function() {
          _.assign(doc, { remote: undefined, sides: { remote: 1 } })

          await (() => {
            this.pouch.put(doc)
          }).should.throw()
          should((await this.pouch.db.get(doc._id))._rev).equal(old._rev)
        })
      })

      context('when doc is not up to date', () => {
        beforeEach(function() {
          doc.sides.local = 1
          doc.sides.remote = 2
        })

        it('does not update doc with a remote side and no remote', async function() {
          _.assign(doc, { remote: undefined })

          await (() => {
            this.pouch.put(doc)
          }).should.throw()
          should((await this.pouch.db.get(doc._id))._rev).equal(old._rev)
        })
      })
    })

    describe('remove', () => {
      let doc, old

      beforeEach(async function() {
        const builders = new Builders({ pouch: this.pouch })

        old = await builders
          .metafile()
          .path('doc')
          .create()
        doc = _.clone(old)
      })

      it('updates the _deleted attribute of the doc', async function() {
        await (() => {
          this.pouch.remove(doc)
        }).should.not.throw()
        await should(this.pouch.db.get(doc._id)).be.rejectedWith({
          status: 404
        })
        await should(this.pouch.db.get(old._id)).be.rejectedWith({
          status: 404
        })
      })
    })

    describe('bulkDocs', () => {
      let doc1, doc2, old1, old2

      beforeEach(async function() {
        const builders = new Builders({ pouch: this.pouch })

        old1 = await builders
          .metafile()
          .path('doc1')
          .create()
        old2 = await builders
          .metafile()
          .path('doc2')
          .create()

        doc1 = _.clone(old1)
        doc2 = _.clone(old2)
      })

      it(`does not save two docs swallowing error on first one`, async function() {
        doc1._rev = '2-badbeef'
        await should(this.pouch.bulkDocs([doc1, doc2])).be.rejectedWith({
          status: 409
        })
        should((await this.pouch.db.get(doc1._id))._rev).equal(old1._rev)
        should((await this.pouch.db.get(doc2._id))._rev).not.equal(old2._rev)
      })

      it(`does not save two docs swallowing error on second one`, async function() {
        doc2._rev = '2-badbeef'
        await should(this.pouch.bulkDocs([doc1, doc2])).be.rejectedWith({
          status: 409
        })
        should((await this.pouch.db.get(doc1._id))._rev).not.equal(old1._rev)
        should((await this.pouch.db.get(doc2._id))._rev).equal(old2._rev)
      })
    })

    describe('getAll', () => {
      it('returns all the documents matching the query', async function() {
        const params = {
          startkey: [metadata.id('my-folder') + path.sep, ''],
          endkey: [metadata.id('my-folder') + path.sep, '\ufff0'],
          include_docs: true
        }
        const docs = await this.pouch.getAll('byPath', params)
        should(docs).have.length(6)
        should(docs).containDeep(
          createdDocs.filter(d => d.path !== 'my-folder') // Parent dir is not returned
        )
      })
    })

    describe('byIdMaybe', () => {
      it('resolves with a doc matching the given _id if any', async function() {
        const existing = await this.pouch.db.post({
          docType: 'folder',
          path: 'my-folder'
        })
        const doc = await this.pouch.byIdMaybe(existing.id)
        should(doc).have.properties({
          docType: 'folder',
          path: 'my-folder'
        })
      })

      it('resolves with nothing otherwise', async function() {
        const doc = await this.pouch.byIdMaybe('not-found')
        should(doc).be.undefined()
      })

      it('does not swallow non-404 errors', async function() {
        const err = new Error('non-404 error')
        err.status = 500
        const get = sinon.stub(this.pouch.db, 'get').rejects(err)
        try {
          await should(
            this.pouch.byIdMaybe(metadata.id('my-folder'))
          ).be.rejectedWith(err)
        } finally {
          get.restore()
        }
      })
    })

    describe('bySyncedPath', () => {
      it('resolves with the doc whose path attribute matches the given path', async function() {
        for (const doc of createdDocs) {
          await should(this.pouch.bySyncedPath(doc.path)).be.fulfilledWith(doc)
        }
      })

      it('resolves with nothing otherwise', async function() {
        const doc = await this.pouch.bySyncedPath('not-found')
        should(doc).be.undefined()
      })
    })

    describe('byChecksum', () => {
      it('gets all the files with this checksum', async function() {
        const filePath = path.join('my-folder', 'file-1')
        const _id = metadata.id(filePath)
        const checksum = `111111111111111111111111111111111111111${filePath}`
        const docs = await this.pouch.byChecksum(checksum)
        docs.length.should.be.equal(1)
        docs[0]._id.should.equal(_id)
        docs[0].path.should.equal(filePath)
        docs[0].md5sum.should.equal(checksum)
      })
    })

    describe('byPath', function() {
      it('gets all the files and folders in this path', async function() {
        const docs = await this.pouch.byPath(metadata.id('my-folder'))
        should(docs).have.length(6)
        should(docs).containDeep(
          createdDocs.filter(d => d.path !== 'my-folder') // Parent dir is not returned
        )
      })

      it('gets only files and folders in the first level', async function() {
        createdDocs.push(
          await pouchHelpers.createFile(
            this.pouch,
            path.join('my-folder', 'folder-2', 'hello')
          )
        )
        const docs = await this.pouch.byPath('')
        docs.length.should.be.equal(1)
        docs[0].should.have.properties({
          _id: metadata.id('my-folder'),
          path: 'my-folder',
          docType: 'folder',
          tags: []
        })
      })

      it('ignores design documents', async function() {
        const docs = await this.pouch.byPath('_design')
        docs.length.should.be.equal(0)
      })
    })

    describe('byRecurivePath', function() {
      it('gets the files and folders in this path recursively', async function() {
        const docs = await this.pouch.byRecursivePath('my-folder')
        docs.length.should.be.equal(6)
        for (let i = 1; i <= 3; i++) {
          docs[i - 1].should.have.properties({
            _id: metadata.id(path.join('my-folder', `file-${i}`)),
            path: path.join('my-folder', `file-${i}`),
            docType: 'file',
            tags: []
          })
          docs[i + 2].should.have.properties({
            _id: metadata.id(path.join('my-folder', `folder-${i}`)),
            path: path.join('my-folder', `folder-${i}`),
            docType: 'folder',
            tags: []
          })
        }
      })

      it('gets the files and folders from root', async function() {
        const docs = await this.pouch.byRecursivePath('')
        docs.length.should.be.equal(7)
        docs[0].should.have.properties({
          _id: metadata.id('my-folder'),
          path: 'my-folder',
          docType: 'folder',
          tags: []
        })
        for (let i = 1; i <= 3; i++) {
          docs[i].should.have.properties({
            _id: metadata.id(path.join('my-folder', `file-${i}`)),
            path: path.join('my-folder', `file-${i}`),
            docType: 'file',
            tags: []
          })
          docs[i + 3].should.have.properties({
            _id: metadata.id(path.join('my-folder', `folder-${i}`)),
            path: path.join('my-folder', `folder-${i}`),
            docType: 'folder',
            tags: []
          })
        }
      })

      context('in descending mode', () => {
        it('sorts the results in descending path order', async function() {
          const docs = await this.pouch.byRecursivePath('', {
            descending: true
          })
          should(docs).have.length(7)
          should(docs).deepEqual(
            createdDocs.sort((a, b) => {
              if (metadata.id(a.path) < metadata.id(b.path)) return 1
              if (metadata.id(a.path) > metadata.id(b.path)) return -1
              return 0
            })
          )
        })
      })

      it('does not return the content of other folders starting with the same path', async function() {
        // create my-folder/folder-11
        const similarFolderPath = path.join('my-folder', 'folder-1 other')
        await pouchHelpers.createFolder(this.pouch, similarFolderPath)
        const similarFolderContentPath = path.join(
          'my-folder',
          'folder-1 other',
          'file'
        )
        await pouchHelpers.createFolder(this.pouch, similarFolderContentPath)

        const docs = await this.pouch.byRecursivePath(
          metadata.id(path.join('my-folder', 'folder-1'))
        )
        const paths = docs.map(d => d.path)
        should(paths).not.containEql(similarFolderContentPath)
      })
    })

    describe('byRemoteId', function() {
      it('gets all the file with this remote id', async function() {
        const filePath = path.join('my-folder', 'file-1')
        const id = `1234567890-${filePath}`
        const doc = await this.pouch.byRemoteId(id)
        doc.remote._id.should.equal(id)
        should.exist(doc._id)
        should.equal(doc.path, filePath)
        should.exist(doc.docType)
      })

      it('returns a 404 error if no file matches', async function() {
        let id = 'abcdef'
        await should(this.pouch.byRemoteId(id)).be.rejectedWith({
          status: 404
        })
      })
    })

    describe('byRemoteIdMaybe', function() {
      it('does the same as byRemoteId() when document exists', async function() {
        const filePath = path.join('my-folder', 'file-1')
        const id = `1234567890-${filePath}`
        const doc = await this.pouch.byRemoteIdMaybe(id)
        doc.remote._id.should.equal(id)
        should.exist(doc._id)
        should.equal(doc.path, filePath)
        should.exist(doc.docType)
      })

      it('returns null when document does not exist', async function() {
        let id = 'abcdef'
        const doc = await this.pouch.byRemoteIdMaybe(id)
        should.equal(null, doc)
      })

      it('returns any non-404 error', async function() {
        const otherError = new Error('not a 404')
        sinon.stub(this.pouch, 'byRemoteId').yields(otherError)

        await should(this.pouch.byRemoteIdMaybe('12345678901')).be.rejectedWith(
          otherError
        )
      })
    })

    describe('#allByRemoteIds()', () => {
      let dir, file

      beforeEach(async function() {
        const builders = new Builders({ pouch: this.pouch })
        dir = await builders
          .metadir()
          .path('dir-with-remote-id')
          .upToDate()
          .create()
        file = await builders
          .metafile()
          .path('file-with-remote-id')
          .upToDate()
          .create()
      })

      it('resolves with docs matching the given remoteIds, in the same order', async function() {
        const expectedDocs = [file, dir]
        const remoteIds = expectedDocs.map(doc => doc.remote._id)
        const docs = await this.pouch.allByRemoteIds(remoteIds)
        should(docs).deepEqual(expectedDocs)
      })

      it('resolves with matching docs except missing ones', async function() {
        const docs = await this.pouch.allByRemoteIds([
          dir.remote._id,
          'missing',
          file.remote._id
        ])
        should(docs).deepEqual([dir, file])
      })

      it('resolves to an empty Array when given a single missing remote id', async function() {
        const docs = await this.pouch.allByRemoteIds(['missing'])
        should(docs).deepEqual([])
      })

      it('resolves to an empty Array when given an empty Array', async function() {
        const docs = await this.pouch.allByRemoteIds([])
        should(docs).deepEqual([])
      })

      it('does not care about duplicate ids & docs', async function() {
        const id = dir.remote._id
        const docs = await this.pouch.allByRemoteIds([id, id])
        should(docs).deepEqual([dir, dir])
      })

      it('can take a Set of remoteIds instead of an Array', async function() {
        const expectedDocs = [dir, file]
        const remoteIds = new Set(expectedDocs.map(doc => doc.remote._id))
        const docs = await this.pouch.allByRemoteIds(remoteIds)
        should(docs).deepEqual(expectedDocs)
      })
    })
  })

  describe('Views', function() {
    describe('createDesignDoc', function() {
      const query = `function (doc) {
        if (doc.docType === 'file') {
          emit(doc._id)
        }
      }`

      it('creates a new design doc', async function() {
        await this.pouch.createDesignDoc('file', query)
        const docs = await this.pouch.getAll('file')
        should(docs).have.length(3)
        for (const doc of docs) {
          should(doc.docType).equal('file')
        }
      })

      it('does not update the same design doc', async function() {
        await this.pouch.createDesignDoc('file', query)
        const was = await this.pouch.db.get('_design/file')
        await this.pouch.createDesignDoc('file', query)
        const designDoc = await this.pouch.db.get('_design/file')
        designDoc._id.should.equal(was._id)
        designDoc._rev.should.equal(was._rev)
      })

      it('updates the design doc if the query change', async function() {
        await this.pouch.createDesignDoc('file', query)
        const was = await this.pouch.db.get('_design/file')
        let newQuery = query.replace('file', 'File')
        await this.pouch.createDesignDoc('file', newQuery)
        const designDoc = await this.pouch.db.get('_design/file')
        designDoc._id.should.equal(was._id)
        designDoc._rev.should.not.equal(was._rev)
        designDoc.views.file.map.should.equal(newQuery)
      })
    })

    describe('addByPathView', () => {
      it('creates the byPath view', async function() {
        await this.pouch.addByPathView()
        const doc = await this.pouch.db.get('_design/byPath')
        should.exist(doc)
      })
    })

    describe('addByChecksumView', () => {
      it('creates the byChecksum view', async function() {
        await this.pouch.addByChecksumView()
        const doc = await this.pouch.db.get('_design/byChecksum')
        should.exist(doc)
      })
    })

    describe('addByRemoteIdView', () => {
      it('creates the byRemoteId view', async function() {
        await this.pouch.addByRemoteIdView()
        const doc = await this.pouch.db.get('_design/byRemoteId')
        should.exist(doc)
      })
    })

    describe('removeDesignDoc', () => {
      it('removes given view', async function() {
        let query = `function (doc) {
          if (doc.docType === 'folder') {
            emit(doc._id);
          }
        }`

        await this.pouch.createDesignDoc('folder', query)
        const docs = await this.pouch.getAll('folder')
        docs.length.should.be.above(1)
        await this.pouch.removeDesignDoc('folder')
        await should(this.pouch.getAll('folder')).be.fulfilledWith([])
      })
    })
  })

  describe('Helpers', function() {
    describe('getPreviousRev', () =>
      it('retrieves previous document informations', async function() {
        const dirPath = path.join('my-folder', 'folder-1')
        const doc = await this.pouch.bySyncedPath(dirPath)

        // Update 1
        const tags = ['yipee']
        const updated = await this.pouch.db.put({
          ...doc,
          tags
        })
        // Update 2
        await this.pouch.db.remove(doc._id, updated.rev)

        // Get doc as it was 2 revisions ago
        should(await this.pouch.getPreviousRev(doc._id, 2)).have.properties({
          path: dirPath,
          tags: doc.tags
        })
        // Get doc as it was 1 revision ago
        should(await this.pouch.getPreviousRev(doc._id, 1)).have.properties({
          path: dirPath,
          tags
        })
        // Get doc as it is now
        should(await this.pouch.getPreviousRev(doc._id, 0))
          .have.properties({
            _deleted: true
          })
          .and.not.have.properties(['path', 'tags']) // erased by PouchDB.remove
      }))
  })

  describe('Sequence numbers', function() {
    describe('getLocalSeq', () =>
      it('gets 0 when the local seq number is not initialized', async function() {
        await should(this.pouch.getLocalSeq()).be.fulfilledWith(0)
      }))

    describe('setLocalSeq', () =>
      it('saves the local sequence number', async function() {
        await this.pouch.setLocalSeq(21)
        await should(this.pouch.getLocalSeq()).be.fulfilledWith(21)
        await this.pouch.setLocalSeq(22)
        await should(this.pouch.getLocalSeq()).be.fulfilledWith(22)
      }))

    describe('getRemoteSeq', () =>
      it('gets 0 when the remote seq number is not initialized', async function() {
        await should(this.pouch.getRemoteSeq()).be.fulfilledWith(0)
      }))

    describe('setRemoteSeq', function() {
      it('saves the remote sequence number', async function() {
        await this.pouch.setRemoteSeq(31)
        await should(this.pouch.getRemoteSeq()).be.fulfilledWith(31)
        await this.pouch.setRemoteSeq(32)
        await should(this.pouch.getRemoteSeq()).be.fulfilledWith(32)
      })

      it('can be called multiple times in parallel', async function() {
        await Promise.map(
          _.range(1, 101),
          seq => this.pouch.setRemoteSeq(seq),
          { concurrency: 2 }
        )
      })
    })
  })

  describe('unsyncedDocIds', function() {
    it('returns the list of changed docs since the current local sequence', async function() {
      const changedDocIds = createdDocs.map(d => d._id)

      await should(this.pouch.unsyncedDocIds()).be.fulfilledWith(changedDocIds)
    })

    it('can be called multiple times in a row', async function() {
      const unsyncedDocIds = await this.pouch.unsyncedDocIds()

      await should(this.pouch.unsyncedDocIds()).be.fulfilledWith(unsyncedDocIds)
    })
  })

  describe('touchDocs', function() {
    it('does nothing when no document ids are given', async function() {
      await should(this.pouch.touchDocs([])).be.fulfilledWith([])
    })

    it('does nothing when no documents exist with the given ids', async function() {
      await should(
        this.pouch.touchDocs(['inexistant-doc-id'])
      ).be.fulfilledWith([])
    })

    it('updates the _rev value of all existing documents with the given ids', async function() {
      const touchResult = await this.pouch.touchDocs(
        createdDocs.map(d => d._id)
      )
      should(touchResult).have.length(createdDocs.length)

      // Check that the short _rev has been incremented but nothing else has
      // changed.
      const shortRev = rev => Number(rev.split('-')[0])
      const expected = createdDocs.map(({ _rev, ...rest }) => ({
        shortRev: shortRev(_rev) + 1,
        ...rest
      }))
      const touchedDocs = await Promise.all(
        touchResult.map(({ id }) => this.pouch.byIdMaybe(id))
      ).map(({ _rev, ...rest }) => ({ shortRev: shortRev(_rev), ...rest }))
      should(touchedDocs).deepEqual(expected)
    })
  })
})
