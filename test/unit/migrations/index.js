/* @flow */
/* eslint-env mocha */

const path = require('path')

const should = require('should')
const sinon = require('sinon')

const metadata = require('../../../core/metadata')
const {
  MigrationFailedError,
  currentSchemaVersion,
  migrate,
  migrations,
  runMigrations,
  save,
  updateSchemaVersion
} = require('../../../core/migrations')
const {
  SCHEMA_DOC_ID,
  SCHEMA_INITIAL_VERSION
} = require('../../../core/migrations/constants')
const { PouchError } = require('../../../core/pouch/error')
const { ROOT_DIR_ID } = require('../../../core/remote/constants')
const configHelpers = require('../../support/helpers/config')
const pouchHelpers = require('../../support/helpers/pouch')

/*::
import type { Migration } from '../../../core/migrations/migrations'
import type { SavedMetadata } from '../../../core/metadata'
*/

describe('core/migrations', function() {
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

  describe('runMigrations', () => {
    let currentVersion /* number */
    let availableMigrations /*: Migration[] */
    beforeEach('create migrations', async function() {
      currentVersion = await currentSchemaVersion(this.pouch.db)
      availableMigrations = [
        {
          baseSchemaVersion: currentVersion,
          targetSchemaVersion: currentVersion + 1,
          description: 'Test migration 1',
          affectedDocs: docs => docs,
          run: docs =>
            Promise.resolve(
              docs.map(doc => ({
                ...doc,
                migration1: true
              }))
            )
        },
        {
          baseSchemaVersion: currentVersion + 1,
          targetSchemaVersion: currentVersion + 2,
          description: 'Test migration 2',
          affectedDocs: docs => docs,
          run: docs =>
            Promise.resolve(
              docs.map(doc => ({
                ...doc,
                migration2: true
              }))
            )
        },
        {
          baseSchemaVersion: currentVersion + 2,
          targetSchemaVersion: currentVersion + 3,
          description: 'Test migration 3',
          affectedDocs: docs => docs,
          run: docs =>
            Promise.resolve(
              docs.map(doc => ({
                ...doc,
                migration3: true
              }))
            )
        }
      ]
    })

    it('runs all given migrations', async function() {
      await runMigrations(availableMigrations, this)

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
          return Promise.resolve(migratedDocs)
        }
      }
      sinon.spy(migrationFailingOnce, 'run')
      availableMigrations.splice(1, 1, migrationFailingOnce)

      await runMigrations(availableMigrations, this)

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
          Promise.resolve(
            docs.map(doc => ({
              ...doc,
              migration2: true,
              _rev: doc._rev.replace(/\d/, '9')
            }))
          )
      }
      availableMigrations.splice(1, 1, migrationFailing)

      try {
        await runMigrations(availableMigrations, this)
        should.fail()
      } catch (err) {
        should(err).be.instanceof(MigrationFailedError)
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

    let migrationRunSpy
    beforeEach('spy on migration.run', () => {
      migrationRunSpy = sinon.spy(migration, 'run')
    })

    afterEach('remove spy', () => {
      migrationRunSpy.restore()
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
          await migrate(migration, this)
          should(migration.run).not.have.been.called()
        })

        it('does not update the schema version', async function() {
          const previousSchemaVersion = await currentSchemaVersion(
            this.pouch.db
          )

          await migrate(migration, this)
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
          await migrate(migration, this)
          should(migration.run).not.have.been.called()
        })

        it('does not update the schema version', async function() {
          const previousSchemaVersion = await currentSchemaVersion(
            this.pouch.db
          )

          await migrate(migration, this)
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
          let migrationAffectedDocs
          beforeEach('mark all docs as unaffected', () => {
            migrationAffectedDocs = sinon
              .stub(migration, 'affectedDocs')
              .callsFake(() => [])
          })

          afterEach('remove stub', () => {
            migrationAffectedDocs.restore()
          })

          it('does not save any docs', async function() {
            await migrate(migration, this)

            const docs = await this.pouch.allDocs()
            const migratedDocs = docs.filter(d => d.migrated)
            should(migratedDocs).be.empty()
          })

          it('sets the schema version to the migration target schema version', async function() {
            await migrate(migration, this)
            await should(currentSchemaVersion(this.pouch.db)).be.fulfilledWith(
              migration.targetSchemaVersion
            )
          })
        })

        context('and some docs needed to be migrated', () => {
          it('runs the migration on all affected docs', async function() {
            const docs = await this.pouch.allDocs()

            await migrate(migration, { pouch: this.pouch, remote: this.remote })
            should(migration.run).have.been.calledOnce()
            should(migrationRunSpy.getCall(0).args).deepEqual([
              docs,
              { pouch: this.pouch, remote: this.remote }
            ])
          })

          it('saves the migrated docs', async function() {
            await migrate(migration, this)

            const docs = await this.pouch.allDocs()
            const migratedDocs = docs.filter(d => d.migrated)
            should(migratedDocs.length).equal(docs.length)
          })

          context('and the docs were successfully saved', () => {
            it('sets the schema version to the migration target schema version', async function() {
              await migrate(migration, this)
              await should(
                currentSchemaVersion(this.pouch.db)
              ).be.fulfilledWith(migration.targetSchemaVersion)
            })

            it('sets the localSeq to the last change seq', async function() {
              const expected = await this.pouch.db.changes({ since: 0 })
              await migrate(migration, this)
              await should(this.pouch.getLocalSeq()).be.fulfilledWith(
                expected.last_seq
              )
            })

            it('does not update the remoteSeq', async function() {
              const expected = await this.pouch.getRemoteSeq(ROOT_DIR_ID)

              await migrate(migration, this)
              await should(
                this.pouch.getRemoteSeq(ROOT_DIR_ID)
              ).be.fulfilledWith(expected)
            })

            it('does not prevent synchronizing merged changes', async function() {
              // We should have 7 unsynced docs, created in the main beforeEach
              const unsyncedDocIds = createdDocs.map(d => d._id)

              await should(this.pouch.unsyncedDocIds()).be.fulfilledWith(
                unsyncedDocIds
              )
              await migrate(migration, this)
              await should(this.pouch.unsyncedDocIds()).be.fulfilledWith(
                unsyncedDocIds
              )
            })
          })

          context('and some docs were not successfully saved', () => {
            const isCorruptedDoc = index => index % 2 === 1

            beforeEach('stub migration.run() to return invalid docs', () => {
              migrationRunSpy.restore()
              sinon.stub(migration, 'run').callsFake(docs =>
                docs.map((doc, index) => {
                  const newDoc = {
                    ...doc,
                    migrated: true
                  }

                  if (isCorruptedDoc(index)) {
                    newDoc._id = doc._id
                    newDoc._rev = doc._rev.replace(/\d/, '9')
                  }

                  return newDoc
                })
              )
            })

            it('reverts all changes', async function() {
              const docs = await this.pouch.allDocs()

              await migrate(migration, this)
              await should(this.pouch.allDocs()).be.fulfilledWith(docs)
            })

            it('does not update the schema version', async function() {
              const previousSchemaVersion = await currentSchemaVersion(
                this.pouch.db
              )

              await migrate(migration, this)
              await should(
                currentSchemaVersion(this.pouch.db)
              ).be.fulfilledWith(previousSchemaVersion)
            })

            it('does not update the localSeq', async function() {
              const expected = await this.pouch.getLocalSeq()

              await migrate(migration, this)
              await should(this.pouch.getLocalSeq()).be.fulfilledWith(expected)
            })

            it('does not update the remoteSeq', async function() {
              const expected = await this.pouch.getRemoteSeq(ROOT_DIR_ID)

              await migrate(migration, this)
              await should(
                this.pouch.getRemoteSeq(ROOT_DIR_ID)
              ).be.fulfilledWith(expected)
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
        docs = await this.pouch.allDocs()
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

        const savedDocs = await this.pouch.allDocs()
        const migratedDocs = savedDocs.filter(d => d.migrated)
        should(migratedDocs.length).equal(savedDocs.length)
      })
    })

    context('with some invalid docs', () => {
      const isCorruptedDoc = index => index % 2 === 1

      let docs
      beforeEach('fetch and update docs', async function() {
        docs = await this.pouch.allDocs()
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

        const maybeMigratedDocs = await this.pouch.allDocs()
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
        const docs = (await this.pouch.allDocs()).map(doc => {
          doc.sides.target = 2
          return doc
        })
        should(migration.affectedDocs(docs)).be.empty()
      })

      it('returns only docs missing sides.target', async function() {
        const docs = await this.pouch.allDocs()
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
        const docs = await this.pouch.allDocs()
        const expected = docs.map(doc => ({
          ...doc,
          sides: {
            ...doc.sides,
            target: metadata.extractRevNumber(doc)
          }
        }))

        await should(migration.run(docs, this)).be.fulfilledWith(expected)
      })
    })
  })
})
