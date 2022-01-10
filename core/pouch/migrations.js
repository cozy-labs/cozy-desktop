/**
 * @module core/pouch/migrations
 * @flow
 */

const PouchDB = require('pouchdb')
const uuid = require('uuid/v4')
const path = require('path')

const { PouchError } = require('./error')
const metadata = require('../metadata')

/*::
import type { Pouch } from './'
import type { SavedMetadata } from '../metadata'

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
  affectedDocs: (SavedMetadata[]) => SavedMetadata[],
  run: (SavedMetadata[]) => SavedMetadata[]
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
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(doc => doc.sides == null || doc.sides.target == null)
    },
    run: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.map(doc => {
        doc.sides = doc.sides || {}
        doc.sides.target = metadata.extractRevNumber(doc)
        return doc
      })
    }
  },
  {
    baseSchemaVersion: 1,
    targetSchemaVersion: 2,
    description: 'Removing overwrite attribute of synced documents',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(
        doc =>
          doc.overwrite &&
          doc.sides &&
          doc.sides.target === doc.sides.local &&
          doc.sides.target === doc.sides.remote
      )
    },
    run: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.map(doc => {
        if (doc.overwrite) delete doc.overwrite
        return doc
      })
    }
  },
  {
    baseSchemaVersion: 2,
    targetSchemaVersion: 3,
    description: 'Marking Cozy Notes for refetch to avoid conflicts',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(
        doc =>
          doc.mime === 'text/vnd.cozy.note+markdown' &&
          doc.metadata &&
          doc.metadata.content &&
          doc.sides &&
          doc.sides.local &&
          doc.sides.remote
      )
    },
    run: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.map(doc => {
        if (doc.sides && doc.sides.local && doc.sides.remote) {
          doc.sides.target =
            Math.max(doc.sides.target, doc.sides.local, doc.sides.remote) + 1
          doc.sides.remote = doc.sides.target
        }
        return doc
      })
    }
  },
  {
    baseSchemaVersion: 3,
    targetSchemaVersion: 4,
    description: 'Generating files local Metadata info with current Metadata',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(doc => doc.docType === 'file')
    },
    run: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.map(doc => {
        // $FlowFixMe path was not present when this migration was created
        doc.local = {
          md5sum: doc.md5sum,
          class: doc.class,
          docType: 'file',
          executable: doc.executable,
          updated_at: doc.updated_at,
          mime: doc.mime,
          size: doc.size,
          ino: doc.ino,
          fileid: doc.fileid
        }
        return doc
      })
    }
  },
  {
    baseSchemaVersion: 4,
    targetSchemaVersion: 5,
    description: 'Removing moveFrom attribute of synced documents',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(
        doc =>
          doc.moveFrom &&
          doc.sides &&
          doc.sides.target === doc.sides.local &&
          doc.sides.target === doc.sides.remote
      )
    },
    run: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.map(doc => {
        if (doc.moveFrom) delete doc.moveFrom
        return doc
      })
    }
  },
  {
    baseSchemaVersion: 5,
    targetSchemaVersion: 6,
    description: 'Generating folders local Metadata info with current Metadata',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(doc => doc.docType === 'folders')
    },
    run: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.map(doc => {
        // $FlowFixMe path was not present when this migration was created
        doc.local = {
          docType: 'folder',
          updated_at: doc.updated_at,
          ino: doc.ino,
          fileid: doc.fileid
        }
        return doc
      })
    }
  },
  {
    baseSchemaVersion: 6,
    targetSchemaVersion: 7,
    description: 'Add path to local and remote metadata',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(doc => doc.local != null || doc.remote != null)
    },
    run: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.map(doc => {
        if (doc.local) doc.local.path = doc.path
        if (doc.remote)
          doc.remote.path = '/' + path.posix.join(...doc.path.split(path.sep))
        return doc
      })
    }
  },
  {
    baseSchemaVersion: 7,
    targetSchemaVersion: 8,
    description: 'Set all files executable attribute',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(
        doc => doc.docType === 'file' && doc.executable == null
      )
    },
    run: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.map(doc => {
        doc.executable = false
        if (doc.local && doc.local.executable == null) {
          doc.local.executable = false
        }
        return doc
      })
    }
  },
  {
    baseSchemaVersion: 8,
    targetSchemaVersion: 9,
    description: 'Default tags attribute to an empty Array',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(doc => doc.docType != null && !doc.tags)
    },
    run: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.map(doc => {
        doc.tags = []
        return doc
      })
    }
  },
  {
    baseSchemaVersion: 9,
    targetSchemaVersion: 10,
    description: 'Cleanup corrupted record sides',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(
        doc =>
          doc.sides &&
          ((doc.sides.local && !doc.local) || (doc.sides.remote && !doc.remote))
      )
    },
    run: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.map(doc => {
        if (doc.sides.local && !doc.local) {
          // Remove local side when no local attribute exists
          delete doc.sides.local
        }
        if (doc.sides.remote && !doc.remote) {
          // Remove remote side when no remote attribute exists
          delete doc.sides.remote
        }
        if (!doc.sides.local && !doc.sides.remote) {
          // Erase record is no sides are remaining
          doc._deleted = true
        }
        // Remove errors, in case this would result in a new Sync attempt
        delete doc.errors
        return doc
      })
    }
  },
  {
    baseSchemaVersion: 10,
    targetSchemaVersion: 11,
    description: 'Add type attribute to pathMaxBytes incompatibilities',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(
        doc =>
          doc.incompatibilities &&
          doc.incompatibilities.find(issue => issue.type == null) != null
      )
    },
    run: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.map(doc => {
        if (doc.incompatibilities) {
          const issue = doc.incompatibilities.find(issue => issue.type == null)
          if (issue) {
            // $FlowFixMe `type` is not set so it can't be another value
            issue.type = 'pathMaxBytes'
          }
        }
        return doc
      })
    }
  },
  {
    baseSchemaVersion: 11,
    targetSchemaVersion: 12,
    description: 'Remove unnecessary Windows path length incompatibilities',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(
        doc =>
          doc.incompatibilities &&
          doc.incompatibilities.find(
            issue =>
              issue.platform === 'win32' &&
              issue.type === 'pathMaxBytes' &&
              issue.pathBytes <= 32766
          ) != null
      )
    },
    run: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.map(doc => {
        if (doc.incompatibilities) {
          if (doc.incompatibilities.length === 1) {
            // Sync expects `incompatibilities` to be missing when there aren't
            // any so if we're about to delete the last one, we remove the
            // attribute altogether.
            delete doc.incompatibilities
          } else {
            const { incompatibilities } = doc
            const index = incompatibilities.findIndex(
              issue =>
                issue.platform === 'win32' &&
                issue.type === 'pathMaxBytes' &&
                issue.pathBytes < 32766
            )
            incompatibilities.splice(index, 1)
          }
        }
        return doc
      })
    }
  },
  {
    baseSchemaVersion: 12,
    targetSchemaVersion: 13,
    description: 'Merge trashed and deleted attributes into trashed',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      // $FlowFixMe `deleted` has been removed from Metadata thus this migration
      return docs.filter(doc => doc.deleted != null)
    },
    run: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.map(doc => {
        // $FlowFixMe `deleted` has been removed from Metadata
        if (doc.deleted) {
          doc.trashed = true
        }
        // $FlowFixMe `deleted` has been removed from Metadata
        delete doc.deleted
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

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MigrationFailedError)
    }

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
      // Keep track of docs that were not read from the changesfeed already
      const unsyncedDocIds = await pouch.unsyncedDocIds()

      const docs /*: SavedMetadata[] */ = await pouch.allDocs()
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
          await pouch.resetDatabase()
          await replicateDB(migrationDB, pouch.db)
          await pouch.touchDocs(unsyncedDocIds)
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
