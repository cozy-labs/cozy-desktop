/**
 * @module core/pouch/migrations
 * @flow
 */

const PouchDB = require('pouchdb')
const uuid = require('uuid/v4')

const { PouchError } = require('./error')
const metadata = require('../metadata')

/*::
import type { Pouch } from './'
import type { Metadata } from '../metadata'

type PouchDBInfo = {
  db_name: string,
  doc_count: number,
  update_seq: number
}

type SchemaVersion = number

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

export type Migration = {
  baseSchemaVersion: SchemaVersion,
  targetSchemaVersion: SchemaVersion,
  description: string,
  affectedDocs: (Metadata[]) => Metadata[],
  run: (Metadata[]) => Metadata[]
}
*/

const SCHEMA_DOC_ID = '_local/schema'
const SCHEMA_INITIAL_VERSION = 0
const INITIAL_SCHEMA = {
  _id: SCHEMA_DOC_ID,
  version: SCHEMA_INITIAL_VERSION
}
const MIGRATION_RESULT_NOOP = 'MigrationNoop'
const MIGRATION_RESULT_COMPLETE = 'MigrationComplete'
const MIGRATION_RESULT_FAILED = 'MigrationFailed'

const migrations /*: Migration[] */ = [
  {
    baseSchemaVersion: SCHEMA_INITIAL_VERSION,
    targetSchemaVersion: 1,
    description: 'Adding sides.target with value of _rev',
    affectedDocs: (docs /*: Metadata[] */) /*: Metadata[] */ => {
      return docs.filter(doc => doc.sides == null || doc.sides.target == null)
    },
    run: (docs /*: Metadata[] */) /*: Metadata[] */ => {
      return docs.map(doc => {
        doc.sides = doc.sides || {}
        doc.sides.target = metadata.extractRevNumber(doc)
        return doc
      })
    }
  }
]

class MigrationFailedError extends Error {
  /*::
  name: string
  migration: string
  errors: PouchError[]
  sentry: true
  */

  constructor(migration /*: Migration */, errors /*: PouchError[] */) {
    super(migration.description)
    this.name = MIGRATION_RESULT_FAILED
    this.errors = errors
    this.sentry = true
  }
}

function migrationNoop() {
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

async function migrate(
  migration /*: Migration */,
  pouch /*: Pouch */
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
      const docs = await pouch.allDocs()
      const affectedDocs = migration.affectedDocs(docs)
      const migratedDocs = migration.run(affectedDocs)

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
          await pouch.resetDatabaseAsync()
          await replicateDB(migrationDB, pouch.db)
          break
      }
    } catch (err) {
      result = { type: MIGRATION_RESULT_FAILED, errors: [err.toString()] }
    } finally {
      migrationDB.destroy()
    }

    return result
  }
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
  const dateString = `${date.getFullYear()}-${date.getMonth() +
    1}-${date.getDate()}`
  const safeUUID = uuid().replace(/-/g, '')
  return `${originalDBInfo.db_name}-migration-${dateString}-${safeUUID}`
}

async function replicateDB(fromDB /*: PouchDB */, toDB /*: PouchDB */) {
  return new Promise(async (resolve, reject) => {
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
  docs /*: Metadata[] */,
  db /*: PouchDB */
) /*: Promise<MigrationResult> */ {
  const migrationResult /* MigrationResult */ = migrationNoop()

  if (docs.length) {
    const pouchResults = await db.bulkDocs(docs)

    for (const result of pouchResults) {
      if (result.error) {
        migrationResult.errors = migrationResult.errors || []
        migrationResult.errors.push(new PouchError(result))
      }
    }

    migrationResult.type = migrationResult.errors.length
      ? MIGRATION_RESULT_FAILED
      : MIGRATION_RESULT_COMPLETE
  }

  return migrationResult
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
  SCHEMA_DOC_ID,
  SCHEMA_INITIAL_VERSION,
  MIGRATION_RESULT_COMPLETE,
  MIGRATION_RESULT_FAILED,
  MIGRATION_RESULT_NOOP,
  migrations,
  MigrationFailedError,
  currentSchemaVersion,
  updateSchemaVersion,
  migrate,
  save,
  migrationLog
}
