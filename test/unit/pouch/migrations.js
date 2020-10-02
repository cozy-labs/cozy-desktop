/* @flow */
/* eslint-env mocha */

const should = require('should')
const sinon = require('sinon')
const path = require('path')

const { PouchError } = require('../../../core/pouch/error')
const {
  SCHEMA_DOC_ID,
  SCHEMA_INITIAL_VERSION,
  migrations,
  currentSchemaVersion,
  updateSchemaVersion,
  migrate,
  save
} = require('../../../core/pouch/migrations')
const metadata = require('../../../core/metadata')

const configHelpers = require('../../support/helpers/config')
const pouchHelpers = require('../../support/helpers/pouch')

/*::
import type { Migration } from '../../../core/pouch/migrations'
*/

describe('core/pouch/migrations', function() {
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

  describe('currentSchemaVersion()', () => {
    context('without schema', () => {
      beforeEach('remove schema', async function() {
        if (await this.pouch.byIdMaybe(SCHEMA_DOC_ID)) {
          await this.pouch.db.put({ _id: SCHEMA_DOC_ID, _deleted: true })
        }
      })

      it('returns SCHEMA_INITIAL_VERSION', async function() {
        await should(currentSchemaVersion(this.pouch.db)).be.fulfilledWith(
          SCHEMA_INITIAL_VERSION
        )
      })
    })

    context('with a schema missing its version', () => {
      beforeEach('corrupt schema', async function() {
        await this.pouch.db.put({ _id: SCHEMA_DOC_ID, version: undefined })
      })

      it('returns SCHEMA_INITIAL_VERSION', async function() {
        await should(currentSchemaVersion(this.pouch.db)).be.fulfilledWith(
          SCHEMA_INITIAL_VERSION
        )
      })
    })

    context('with a valid schema', () => {
      const version = 12

      beforeEach('create schema', async function() {
        await this.pouch.db.put({ _id: SCHEMA_DOC_ID, version })
      })

      it('returns the version of the schema', async function() {
        await should(currentSchemaVersion(this.pouch.db)).be.fulfilledWith(
          version
        )
      })
    })
  })

  describe('updateSchemaVersion()', () => {
    const version = 12

    context('without schema', () => {
      beforeEach('remove schema', async function() {
        if (await this.pouch.byIdMaybe(SCHEMA_DOC_ID)) {
          await this.pouch.db.put({ _id: SCHEMA_DOC_ID, _deleted: true })
        }
      })

      it('creates the schema with the given version', async function() {
        await should(updateSchemaVersion(version, this.pouch.db)).be.fulfilled()
        await should(currentSchemaVersion(this.pouch.db)).be.fulfilledWith(
          version
        )
      })
    })

    context('with a schema missing its version', () => {
      beforeEach('corrupt schema', async function() {
        await this.pouch.db.put({ _id: SCHEMA_DOC_ID, version: undefined })
      })

      it('creates the schema with the given version', async function() {
        await should(updateSchemaVersion(version, this.pouch.db)).be.fulfilled()
        await should(currentSchemaVersion(this.pouch.db)).be.fulfilledWith(
          version
        )
      })
    })

    context('with a valid schema', () => {
      const version = 12

      beforeEach('create schema', async function() {
        await this.pouch.db.put({ _id: SCHEMA_DOC_ID, version })
      })

      it('updates the version of the schema', async function() {
        const newVersion = version + 1
        await should(
          updateSchemaVersion(newVersion, this.pouch.db)
        ).be.fulfilled()
        await should(currentSchemaVersion(this.pouch.db)).be.fulfilledWith(
          newVersion
        )
      })
    })
  })

  describe('migrate()', () => {
    const migration /*: Migration */ = {
      baseSchemaVersion: 2,
      targetSchemaVersion: 3,
      description: 'Test migration',
      affectedDocs: docs => docs,
      run: docs =>
        docs.map(d => ({
          ...d,
          migrated: true
        }))
    }

    beforeEach('spy on migration.run', () => {
      sinon.spy(migration, 'run')
    })

    afterEach('remove spy', () => {
      migration.run.restore()
    })

    context(
      'when the current schema version is lower than the migration base schema version',
      () => {
        beforeEach('set schema version', async function() {
          await this.pouch.db.put({
            _id: SCHEMA_DOC_ID,
            version: migration.baseSchemaVersion - 1
          })
        })

        it('does not run the migration', async function() {
          await migrate(migration, this.pouch)
          should(migration.run).not.have.been.called()
        })

        it('does not update the schema version', async function() {
          const previousSchemaVersion = await currentSchemaVersion(
            this.pouch.db
          )

          await migrate(migration, this.pouch)
          await should(currentSchemaVersion(this.pouch.db)).be.fulfilledWith(
            previousSchemaVersion
          )
        })
      }
    )

    context(
      'when the current schema version is higher than the migration base schema version',
      () => {
        beforeEach('set schema version', async function() {
          await this.pouch.db.put({
            _id: SCHEMA_DOC_ID,
            version: migration.baseSchemaVersion + 1
          })
        })

        it('does not run the migration', async function() {
          await migrate(migration, this.pouch)
          should(migration.run).not.have.been.called()
        })

        it('does not update the schema version', async function() {
          const previousSchemaVersion = await currentSchemaVersion(
            this.pouch.db
          )

          await migrate(migration, this.pouch)
          await should(currentSchemaVersion(this.pouch.db)).be.fulfilledWith(
            previousSchemaVersion
          )
        })
      }
    )

    context(
      'when the current schema version equals the migration base schema version',
      () => {
        beforeEach('set schema version', async function() {
          await this.pouch.db.put({
            _id: SCHEMA_DOC_ID,
            version: migration.baseSchemaVersion
          })
        })

        context('and no docs needed to be migrated', () => {
          beforeEach('mark all docs as unaffected', () => {
            sinon.stub(migration, 'affectedDocs').callsFake(() => [])
          })

          afterEach('remove stub', () => {
            migration.affectedDocs.restore()
          })

          it('does not save any docs', async function() {
            await migrate(migration, this.pouch)

            const docs = await this.pouch.byRecursivePath('')
            const migratedDocs = docs.filter(d => d.migrated)
            should(migratedDocs).be.empty()
          })

          it('sets the schema version to the migration target schema version', async function() {
            await migrate(migration, this.pouch)
            await should(currentSchemaVersion(this.pouch.db)).be.fulfilledWith(
              migration.targetSchemaVersion
            )
          })
        })

        context('and some docs needed to be migrated', () => {
          it('runs the migration on all affected docs', async function() {
            const docs = await this.pouch.byRecursivePath('')

            await migrate(migration, this.pouch)
            should(migration.run).have.been.calledOnce()
            should(migration.run.getCall(0).args).deepEqual([docs])
          })

          it('saves the migrated docs', async function() {
            await migrate(migration, this.pouch)

            const docs = await this.pouch.byRecursivePath('')
            const migratedDocs = docs.filter(d => d.migrated)
            should(migratedDocs.length).equal(docs.length)
          })

          context('and the docs were successfully saved', () => {
            it('sets the schema version to the migration target schema version', async function() {
              await migrate(migration, this.pouch)
              await should(
                currentSchemaVersion(this.pouch.db)
              ).be.fulfilledWith(migration.targetSchemaVersion)
            })

            it('sets the localSeq to the last change seq', async function() {
              const expected = await this.pouch.db.changes({ since: 0 })
              await migrate(migration, this.pouch)
              await should(this.pouch.getLocalSeq()).be.fulfilledWith(
                expected.last_seq
              )
            })

            it('does not update the remoteSeq', async function() {
              const expected = await this.pouch.getRemoteSeq()

              await migrate(migration, this.pouch)
              await should(this.pouch.getRemoteSeq()).be.fulfilledWith(expected)
            })

            it('does not prevent synchronizing merged changes', async function() {
              // We should have 7 unsynced docs, created in the main beforeEach
              const unsyncedDocIds = createdDocs.map(d => d._id)

              await should(this.pouch.unsyncedDocIds()).be.fulfilledWith(
                unsyncedDocIds
              )
              await migrate(migration, this.pouch)
              await should(this.pouch.unsyncedDocIds()).be.fulfilledWith(
                unsyncedDocIds
              )
            })
          })

          context('and some docs were not successfully saved', () => {
            const isCorruptedDoc = index => index % 2 === 1

            beforeEach('stub migration.run() to return invalid docs', () => {
              migration.run.restore()
              sinon.stub(migration, 'run').callsFake(docs =>
                docs.map((doc, index) => {
                  const newDoc = {
                    ...doc,
                    migrated: true
                  }

                  if (isCorruptedDoc(index)) {
                    newDoc._rev = doc._rev.replace(/\d/, '9')
                  }

                  return newDoc
                })
              )
            })

            it('reverts all changes', async function() {
              const docs = await this.pouch.byRecursivePath('')

              await migrate(migration, this.pouch)
              await should(this.pouch.byRecursivePath('')).be.fulfilledWith(
                docs
              )
            })

            it('does not update the schema version', async function() {
              const previousSchemaVersion = await currentSchemaVersion(
                this.pouch.db
              )

              await migrate(migration, this.pouch)
              await should(
                currentSchemaVersion(this.pouch.db)
              ).be.fulfilledWith(previousSchemaVersion)
            })

            it('does not update the localSeq', async function() {
              const expected = await this.pouch.getLocalSeq()

              await migrate(migration, this.pouch)
              await should(this.pouch.getLocalSeq()).be.fulfilledWith(expected)
            })

            it('does not update the remoteSeq', async function() {
              const expected = await this.pouch.getRemoteSeq()

              await migrate(migration, this.pouch)
              await should(this.pouch.getRemoteSeq()).be.fulfilledWith(expected)
            })
          })
        })
      }
    )
  })

  describe('save()', () => {
    context('with no docs', () => {
      it('returns a MigrationNoop result', async function() {
        await should(save([], this.pouch.db)).be.fulfilledWith({
          type: 'MigrationNoop',
          errors: []
        })
      })
    })

    context('with only valid docs', () => {
      let docs
      beforeEach('fetch and update docs', async function() {
        docs = await this.pouch.byRecursivePath('')
        docs.forEach(d => {
          d.migrated = true
        })
      })

      it('returns a MigrationComplete result', async function() {
        await should(save(docs, this.pouch.db)).be.fulfilledWith({
          type: 'MigrationComplete',
          errors: []
        })
      })

      it('saves the new version of all documents', async function() {
        await save(docs, this.pouch.db)

        const savedDocs = await this.pouch.byRecursivePath('')
        const migratedDocs = savedDocs.filter(d => d.migrated)
        should(migratedDocs.length).equal(savedDocs.length)
      })
    })

    context('with some invalid docs', () => {
      const isCorruptedDoc = index => index % 2 === 1

      let docs
      beforeEach('fetch and update docs', async function() {
        docs = await this.pouch.byRecursivePath('')
        docs.forEach((d, index) => {
          d.migrated = true
          if (isCorruptedDoc(index)) d._rev = d._rev.replace(/\d/, '9')
        })
      })

      it('returns a MigrationFailed result', async function() {
        await should(save(docs, this.pouch.db)).be.fulfilledWith({
          type: 'MigrationFailed',
          errors: docs
            .map((d, index) => {
              if (isCorruptedDoc(index))
                return new PouchError({
                  name: 'conflict',
                  status: 409,
                  message: 'Document update conflict'
                })
            })
            .filter(err => err)
        })
      })

      it('saves the new version of all valid documents', async function() {
        await save(docs, this.pouch.db)

        const maybeMigratedDocs = await this.pouch.byRecursivePath('')
        maybeMigratedDocs.forEach((md, index) => {
          if (isCorruptedDoc(index)) {
            should(md.migrated).be.undefined()
          } else {
            should(md.migrated).be.true()
          }
        })
      })
    })
  })

  describe('[migration] Migrate _rev to sides.target', () => {
    const migration = migrations[0]

    describe('affectedDocs()', () => {
      it('returns an empty array when all docs have sides.target', async function() {
        const docs = (await this.pouch.byRecursivePath('')).map(doc => {
          doc.sides.target = 2
          return doc
        })
        should(migration.affectedDocs(docs)).be.empty()
      })

      it('returns only docs missing sides.target', async function() {
        const docs = await this.pouch.byRecursivePath('')
        const incompleteDocs = docs.filter((doc, index) => index % 2 === 0)
        docs
          .filter((doc, index) => index % 2 === 1)
          .map(doc => {
            doc.sides.target = 2
            return doc
          })
        should(migration.affectedDocs(docs)).deepEqual(incompleteDocs)
      })
    })

    describe('run()', () => {
      it('sets sides.target with the short rev extracted from _rev', async function() {
        const docs = await this.pouch.byRecursivePath('')
        const expected = docs.map(doc => ({
          ...doc,
          sides: {
            ...doc.sides,
            target: metadata.extractRevNumber(doc)
          }
        }))

        should(migration.run(docs)).deepEqual(expected)
      })
    })
  })
})
