/**
 * @module core/migrations
 * @flow
 */

const PouchDB = require('pouchdb')
const uuid = require('uuid').v4

const { logger } = require('../utils/logger')
const { PouchError } = require('../pouch/error')
const migrations = require('./migrations')
const {
  INITIAL_SCHEMA,
  MIGRATION_RESULT_COMPLETE,
  MIGRATION_RESULT_FAILED,
  MIGRATION_RESULT_NOOP,
  SCHEMA_DOC_ID,
  SCHEMA_INITIAL_VERSION
} = require('./constants')

/*::
import type { SavedMetadata } from '../metadata'
import type { Migration } from './migrations'
import type { InjectedDependencies, SchemaVersion } from './constants'

type PouchDBInfo = {
  db_name: string,
  doc_count: number,
  update_seq: number
}

type MigrationData = {
  errors: PouchError[]
}
type MigrationNoop = MigrationData & {
  type: 'MigrationNoop'
}
type MigrationComplete = MigrationData & {
  type: 'MigrationComplete',
}
type MigrationFailed = MigrationData & {
  type: 'MigrationFailed',
}
type MigrationResult = MigrationNoop|MigrationComplete|MigrationFailed
*/

const log = logger({
  component: 'Migrations'
})

async function runMigrations(
  migrations /*: Migration[] */,
  { pouch, remote } /*: InjectedDependencies */
) {
  log.info('Running migrations...')
  for (const migration of migrations) {
    // First attempt
    const result = await migrate(migration, { pouch, remote })
    log.info(migrationLog(migration, result))

    if (result.type === MIGRATION_RESULT_FAILED) {
      // Retry in case of failure
      const result = await migrate(migration, { pouch, remote })

      if (result.type === MIGRATION_RESULT_FAILED) {
        // Error in case of second failure
        const err = new MigrationFailedError(migration, result.errors)
        log.fatal(migrationLog(migration, result), { err, sentry: true })
        throw err
      } else {
        log.info(migrationLog(migration, result))
      }
    }
  }
  log.info('Migrations done.')
}

async function migrate(
  migration /*: Migration */,
  { pouch, remote } /*: InjectedDependencies */
) /*: Promise<MigrationResult> */ {
  if ((await currentSchemaVersion(pouch.db)) !== migration.baseSchemaVersion) {
    return migrationNoop()
  } else {
    const originalDBInfo = await pouch.db.info()
    const migrationDB = createDB(
      await migrationDBPath(migration, originalDBInfo)
    )

    let result /*: MigrationResult */
    try {
      // Keep track of docs that were not read from the changesfeed already
      const unsyncedDocIds = await pouch.unsyncedDocIds()

      const docs /*: SavedMetadata[] */ = await pouch.allDocs()
      const affectedDocs = migration.affectedDocs(docs)
      const migratedDocs = await migration.run(affectedDocs, { pouch, remote })

      if (migratedDocs.length) {
        await replicateDB(pouch.db, migrationDB)
        result = await save(migratedDocs, migrationDB)
      } else {
        result = migrationNoop()
      }

      switch (result.type) {
        case MIGRATION_RESULT_NOOP:
          await updateSchemaVersion(migration.targetSchemaVersion, pouch.db)
          break
        case MIGRATION_RESULT_COMPLETE:
          await updateSchemaVersion(migration.targetSchemaVersion, migrationDB)
          await pouch.resetDatabase()
          await replicateDB(migrationDB, pouch.db)
          await pouch.touchDocs(unsyncedDocIds)
          break
      }
    } catch (err) {
      result = { type: MIGRATION_RESULT_FAILED, errors: [err] }
    } finally {
      migrationDB.destroy()
    }

    return result
  }
}

class MigrationFailedError extends Error {
  /*::
  name: string
  migration: string
  errors: PouchError[]
  sentry: true
  */

  constructor(migration /*: Migration */, errors /*: PouchError[] */) {
    super(migration.description)

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MigrationFailedError)
    }

    this.name = MIGRATION_RESULT_FAILED
    this.errors = errors
    this.sentry = true
  }
}

function migrationNoop() /*: MigrationNoop */ {
  return { type: MIGRATION_RESULT_NOOP, errors: [] }
}

async function currentSchemaVersion(
  db /*: PouchDB */
) /*: Promise<SchemaVersion> */ {
  const schema = (await safeGet(db, SCHEMA_DOC_ID)) || INITIAL_SCHEMA
  return schema.version || SCHEMA_INITIAL_VERSION
}

async function updateSchemaVersion(
  version /*: SchemaVersion */,
  db /*: PouchDB */
) {
  const schema = (await safeGet(db, SCHEMA_DOC_ID)) || INITIAL_SCHEMA
  return await db.put({ ...schema, version })
}

function createDB(name /*: string */) /*: PouchDB */ {
  return new PouchDB(name).on('error', err => {
    throw err
  })
}

async function migrationDBPath(
  migration /*: Migration */,
  originalDBInfo /*: PouchDBInfo */
) /*: Promise<string> */ {
  const date = new Date()
  const dateString = `${date.getFullYear()}-${
    date.getMonth() + 1
  }-${date.getDate()}`
  const safeUUID = uuid().replace(/-/g, '')
  return `${originalDBInfo.db_name}-migration-${dateString}-${safeUUID}`
}

async function replicateDB(fromDB /*: PouchDB */, toDB /*: PouchDB */) {
  return new Promise((resolve, reject) => {
    fromDB.replicate
      .to(toDB)
      .on('complete', async () => {
        try {
          await safeReplicate(fromDB, toDB, '_local/remoteSeq')
          await safeReplicate(fromDB, toDB, SCHEMA_DOC_ID)
          const toDBInfo = await toDB.info()
          const localSeq = {
            _id: '_local/localSeq',
            seq: toDBInfo.update_seq
          }
          await safePut(toDB, localSeq)
          resolve()
        } catch (err) {
          reject(err)
        }
      })
      .on('denied', err => {
        reject(err)
      })
      .on('error', err => {
        reject(err)
      })
  })
}

async function safeGet(db /*: PouchDB */, id /*: string */) /*: Promise<*> */ {
  let doc
  try {
    doc = await db.get(id)
  } catch (err) {
    if (err.status !== 404) throw err
  }
  return doc
}

async function safePut(
  db /*: PouchDB */,
  doc /*: { _id: string, _rev?: string } */
) /*: Promise<*> */ {
  const currentDoc = await safeGet(db, doc._id)
  if (currentDoc) doc._rev = currentDoc._rev
  return db.put(doc)
}

async function safeReplicate(
  fromDB /*: PouchDB */,
  toDB /*: PouchDB */,
  id /*: string */
) {
  const fromValue = await safeGet(fromDB, id)
  if (fromValue) {
    const toValue = await safeGet(toDB, id)
    if (toValue) fromValue._rev = toValue._rev
    else delete fromValue._rev
    await toDB.put(fromValue)
  }
}

async function save(
  docs /*: SavedMetadata[] */,
  db /*: PouchDB */
) /*: Promise<MigrationResult> */ {
  if (docs.length) {
    const pouchResults = await db.bulkDocs(docs)

    const errors = []
    for (const result of pouchResults) {
      if (result.error) {
        errors.push(new PouchError(result))
      }
    }

    if (errors.length > 0) {
      return {
        type: MIGRATION_RESULT_FAILED,
        errors
      }
    } else {
      return {
        type: MIGRATION_RESULT_COMPLETE,
        errors
      }
    }
  }

  return migrationNoop()
}

function migrationLog(
  migration /*: Migration */,
  result /*: MigrationResult */
) /*: string */ {
  let globalResult

  switch (result.type) {
    case MIGRATION_RESULT_NOOP:
      globalResult = 'NOOP'
      break
    case MIGRATION_RESULT_COMPLETE:
      globalResult = 'Complete'
      break
    case MIGRATION_RESULT_FAILED:
      globalResult = 'Failed'
      break
    default:
      globalResult = 'Unexpected error'
  }
  return `--- ${migration.description} => ${globalResult}`
}

module.exports = {
  MigrationFailedError,
  currentSchemaVersion,
  migrate,
  migrations,
  runMigrations,
  save,
  updateSchemaVersion
}
