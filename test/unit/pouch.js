/* eslint-env mocha */

const Promise = require('bluebird')
const jsv = require('jsverify')
const path = require('path')
const should = require('should')
const sinon = require('sinon')
const _ = require('lodash')
const { uniq } = _

const metadata = require('../../core/metadata')
const migrations = require('../../core/pouch/migrations')

const Builders = require('../support/builders')
const configHelpers = require('../support/helpers/config')
const pouchHelpers = require('../support/helpers/pouch')

describe('Pouch', function() {
  before('instanciate config', configHelpers.createConfig)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  afterEach('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  beforeEach('create folders and files', async function() {
    await pouchHelpers.createParentFolder(this.pouch)
    for (let i of [1, 2, 3]) {
      await pouchHelpers.createFolder(
        this.pouch,
        path.join('my-folder', `folder-${i}`)
      )
      await pouchHelpers.createFile(
        this.pouch,
        path.join('my-folder', `file-${i}`)
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

      const docs = await this.pouch.byRecursivePathAsync('')
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
      const docs = await this.pouch.byRecursivePathAsync('')
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
      const docs = await this.pouch.byRecursivePathAsync('')
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

    describe('getAll', () =>
      it('returns all the documents matching the query', async function() {
        let params = {
          key: metadata.id('my-folder') + path.sep,
          include_docs: true
        }
        const docs = await this.pouch.getAllAsync('byPath', params)
        docs.length.should.equal(6)
        for (let i = 1; i <= 3; i++) {
          docs[i - 1].should.have.properties({
            _id: metadata.id(path.join('my-folder', `file-${i}`)),
            docType: 'file',
            tags: []
          })
          docs[i + 2].should.have.properties({
            _id: metadata.id(path.join('my-folder', `folder-${i}`)),
            docType: 'folder',
            tags: []
          })
        }
      }))

    describe('byIdMaybeAsync', () => {
      it('resolves with a doc matching the given _id if any', async function() {
        const doc = await this.pouch.byIdMaybeAsync(metadata.id('my-folder'))
        should(doc).have.properties({
          docType: 'folder',
          path: 'my-folder'
        })
      })

      it('resolves with nothing otherwise', async function() {
        const doc = await this.pouch.byIdMaybeAsync('not-found')
        should(doc).be.undefined()
      })

      it('does not swallow non-404 errors', async function() {
        const err = new Error('non-404 error')
        err.status = 500
        const get = sinon.stub(this.pouch.db, 'get').rejects(err)
        try {
          await should(
            this.pouch.byIdMaybeAsync(metadata.id('my-folder'))
          ).be.rejectedWith(err)
        } finally {
          get.restore()
        }
      })
    })

    describe('byChecksum', () =>
      it('gets all the files with this checksum', async function() {
        const filePath = path.join('my-folder', 'file-1')
        const _id = metadata.id(filePath)
        const checksum = `111111111111111111111111111111111111111${filePath}`
        const docs = await this.pouch.byChecksumAsync(checksum)
        docs.length.should.be.equal(1)
        docs[0]._id.should.equal(_id)
        docs[0].md5sum.should.equal(checksum)
      }))

    describe('byPath', function() {
      it('gets all the files and folders in this path', async function() {
        const docs = await this.pouch.byPathAsync(metadata.id('my-folder'))
        docs.length.should.be.equal(6)
        for (let i = 1; i <= 3; i++) {
          docs[i - 1].should.have.properties({
            _id: metadata.id(path.join('my-folder', `file-${i}`)),
            docType: 'file',
            tags: []
          })
          docs[i + 2].should.have.properties({
            _id: metadata.id(path.join('my-folder', `folder-${i}`)),
            docType: 'folder',
            tags: []
          })
        }
      })

      it('gets only files and folders in the first level', async function() {
        const docs = await this.pouch.byPathAsync('')
        docs.length.should.be.equal(1)
        docs[0].should.have.properties({
          _id: metadata.id('my-folder'),
          docType: 'folder',
          tags: []
        })
      })

      it('ignores design documents', async function() {
        const docs = await this.pouch.byPathAsync('_design')
        docs.length.should.be.equal(0)
      })
    })

    describe('byRecurivePath', function() {
      it('gets the files and folders in this path recursively', async function() {
        const docs = await this.pouch.byRecursivePathAsync(
          metadata.id('my-folder')
        )
        docs.length.should.be.equal(6)
        for (let i = 1; i <= 3; i++) {
          docs[i - 1].should.have.properties({
            _id: metadata.id(path.join('my-folder', `file-${i}`)),
            docType: 'file',
            tags: []
          })
          docs[i + 2].should.have.properties({
            _id: metadata.id(path.join('my-folder', `folder-${i}`)),
            docType: 'folder',
            tags: []
          })
        }
      })

      it('gets the files and folders from root', async function() {
        const docs = await this.pouch.byRecursivePathAsync('')
        docs.length.should.be.equal(7)
        docs[0].should.have.properties({
          _id: metadata.id('my-folder'),
          docType: 'folder',
          tags: []
        })
        for (let i = 1; i <= 3; i++) {
          docs[i].should.have.properties({
            _id: metadata.id(path.join('my-folder', `file-${i}`)),
            docType: 'file',
            tags: []
          })
          docs[i + 3].should.have.properties({
            _id: metadata.id(path.join('my-folder', `folder-${i}`)),
            docType: 'folder',
            tags: []
          })
        }
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

        const docs = await this.pouch.byRecursivePathAsync(
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
        const doc = await this.pouch.byRemoteIdAsync(id)
        doc.remote._id.should.equal(id)
        should.exist(doc._id)
        should.exist(doc.docType)
      })

      it('returns a 404 error if no file matches', async function() {
        let id = 'abcdef'
        await should(this.pouch.byRemoteIdAsync(id)).be.rejectedWith({
          status: 404
        })
      })
    })

    describe('byRemoteIdMaybe', function() {
      it('does the same as byRemoteId() when document exists', async function() {
        const filePath = path.join('my-folder', 'file-1')
        const id = `1234567890-${filePath}`
        const doc = await this.pouch.byRemoteIdMaybeAsync(id)
        doc.remote._id.should.equal(id)
        should.exist(doc._id)
        should.exist(doc.docType)
      })

      it('returns null when document does not exist', async function() {
        let id = 'abcdef'
        const doc = await this.pouch.byRemoteIdMaybeAsync(id)
        should.equal(null, doc)
      })

      it('returns any non-404 error', async function() {
        const otherError = new Error('not a 404')
        sinon.stub(this.pouch, 'byRemoteId').yields(otherError)

        await should(
          this.pouch.byRemoteIdMaybeAsync('12345678901')
        ).be.rejectedWith(otherError)
      })
    })

    describe('#allByRemoteIds()', () => {
      let dir, file

      beforeEach(async function() {
        const builders = new Builders({ pouch: this.pouch })
        dir = await builders
          .metadir()
          .path('dir-with-remote-id')
          .create()
        file = await builders
          .metafile()
          .path('file-with-remote-id')
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
      let query = `\
function (doc) {
    if (doc.docType === 'file') {
        emit(doc._id);
    }
}\
`

      it('creates a new design doc', async function() {
        await this.pouch.createDesignDocAsync('file', query)
        const docs = await this.pouch.getAllAsync('file')
        docs.length.should.equal(3)
        for (let i = 1; i <= 3; i++) {
          docs[i - 1].docType.should.equal('file')
        }
      })

      it('does not update the same design doc', async function() {
        await this.pouch.createDesignDocAsync('file', query)
        const was = await this.pouch.db.get('_design/file')
        await this.pouch.createDesignDocAsync('file', query)
        const designDoc = await this.pouch.db.get('_design/file')
        designDoc._id.should.equal(was._id)
        designDoc._rev.should.equal(was._rev)
      })

      it('updates the design doc if the query change', async function() {
        await this.pouch.createDesignDocAsync('file', query)
        const was = await this.pouch.db.get('_design/file')
        let newQuery = query.replace('file', 'File')
        await this.pouch.createDesignDocAsync('file', newQuery)
        const designDoc = await this.pouch.db.get('_design/file')
        designDoc._id.should.equal(was._id)
        designDoc._rev.should.not.equal(was._rev)
        designDoc.views.file.map.should.equal(newQuery)
      })
    })

    describe('addByPathView', () =>
      it('creates the path view', async function() {
        await this.pouch.addByPathViewAsync()
        const doc = await this.pouch.db.get('_design/byPath')
        should.exist(doc)
      }))

    describe('addByChecksumView', () =>
      it('creates the checksum view', async function() {
        await this.pouch.addByChecksumViewAsync()
        const doc = await this.pouch.db.get('_design/byChecksum')
        should.exist(doc)
      }))

    describe('addByRemoteIdView', () =>
      it('creates the remote id view', async function() {
        await this.pouch.addByRemoteIdViewAsync()
        const doc = await this.pouch.db.get('_design/byRemoteId')
        should.exist(doc)
      }))

    describe('removeDesignDoc', () =>
      it('removes given view', async function() {
        let query = `\
function (doc) {
if (doc.docType === 'folder') {
  emit(doc._id);
}
}\
`
        await this.pouch.createDesignDocAsync('folder', query)
        const docs = await this.pouch.getAllAsync('folder')
        docs.length.should.be.above(1)
        await this.pouch.removeDesignDocAsync('folder')
        await should(this.pouch.getAllAsync('folder')).be.rejectedWith({
          status: 404
        })
      }))
  })

  describe('Helpers', function() {
    describe('getPreviousRev', () =>
      it('retrieves previous document informations', async function() {
        const id = metadata.id(path.join('my-folder', 'folder-1'))
        const doc = await this.pouch.db.get(id)

        // Update 1
        const tags = ['yipee']
        const updated = await this.pouch.db.put({
          ...doc,
          tags
        })
        // Update 2
        await this.pouch.db.remove(id, updated.rev)

        // Get doc as it was 2 revisions ago
        should(await this.pouch.getPreviousRevAsync(id, 2)).have.properties({
          _id: id,
          tags: doc.tags
        })
        // Get doc as it was 1 revision ago
        should(await this.pouch.getPreviousRevAsync(id, 1)).have.properties({
          _id: id,
          tags
        })
        // Get doc as it is now
        should(await this.pouch.getPreviousRevAsync(id, 0)).have.properties({
          _id: id,
          _deleted: true
        })
      }))
  })

  describe('Sequence numbers', function() {
    describe('getLocalSeq', () =>
      it('gets 0 when the local seq number is not initialized', async function() {
        await should(this.pouch.getLocalSeqAsync()).be.fulfilledWith(0)
      }))

    describe('setLocalSeq', () =>
      it('saves the local sequence number', async function() {
        await this.pouch.setLocalSeqAsync(21)
        await should(this.pouch.getLocalSeqAsync()).be.fulfilledWith(21)
        await this.pouch.setLocalSeqAsync(22)
        await should(this.pouch.getLocalSeqAsync()).be.fulfilledWith(22)
      }))

    describe('getRemoteSeq', () =>
      it('gets 0 when the remote seq number is not initialized', async function() {
        await should(this.pouch.getRemoteSeqAsync()).be.fulfilledWith(0)
      }))

    describe('setRemoteSeq', function() {
      it('saves the remote sequence number', async function() {
        await this.pouch.setRemoteSeqAsync(31)
        await should(this.pouch.getRemoteSeqAsync()).be.fulfilledWith(31)
        await this.pouch.setRemoteSeqAsync(32)
        await should(this.pouch.getRemoteSeqAsync()).be.fulfilledWith(32)
      })

      it('can be called multiple times in parallel', async function() {
        await Promise.map(
          _.range(1, 101),
          seq => this.pouch.setRemoteSeqAsync(seq),
          { concurrency: 2 }
        )
      })
    })
  })

  // Disable this test on travis because it can be really slow...
  if (process.env.CI) {
    return
  }
  describe('byRecursivePath (bis)', function() {
    // TODO counter  rngState: 0020bacd4697fe1358;
    //               Counterexample: [".", "Æ\u0004]"]
    //               rngState: 0d2c085d3e964fb71a;
    //               Counterexample: [".", "a\u0012%"];
    //               rngState: 8df0312a56cde9b748;
    //               Counterexample: ["."];

    // jsverify only works with Promise for async stuff
    if (typeof Promise !== 'function') {
      return
    }

    it('gets the nested files and folders', function(done) {
      let base = 'byRecursivePath'
      let property = jsv.forall('nearray nestring', paths => {
        paths = uniq(paths.concat([base]))
        return new Promise((resolve, reject) => {
          return this.pouch.resetDatabase(function(err) {
            if (err) {
              return reject(err)
            } else {
              return resolve()
            }
          })
        })
          .then(() => {
            return Promise.all(
              paths.map(p => {
                let doc = {
                  _id: metadata.id(path.join(base, p)),
                  docType: 'folder'
                }
                return this.pouch.db.put(doc)
              })
            )
          })
          .then(() => {
            return new Promise((resolve, reject) => {
              return this.pouch.byRecursivePath(metadata.id(base), function(
                err,
                docs
              ) {
                if (err) {
                  return reject(err)
                } else {
                  return resolve(docs.length === paths.length)
                }
              })
            })
          })
      })
      jsv.assert(property, { tests: 10 }).then(function(res) {
        if (res === true) {
          done()
        } else {
          return done(res)
        }
      })
    })
  })
})
