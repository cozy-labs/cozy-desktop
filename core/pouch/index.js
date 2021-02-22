/**
 * @module core/pouch
 * @flow weak
 */

const autoBind = require('auto-bind')
const Promise = require('bluebird')
const PouchDB = require('pouchdb')
const async = require('async')
const fse = require('fs-extra')
const _ = require('lodash')
const { isEqual } = _
const path = require('path')

const metadata = require('../metadata')
const logger = require('../utils/logger')
const { PouchError } = require('./error')
const {
  MIGRATION_RESULT_FAILED,
  MigrationFailedError,
  migrate,
  migrationLog
} = require('./migrations')

/*::
import type { Config } from '../config'
import type { Metadata, SavedMetadata } from '../metadata'
import type { Callback } from '../utils/func'
import type { Migration } from './migrations'

export type PouchRecord = { _id: string, _rev: string, _deleted?: true }
*/

const log = logger({
  component: 'Pouch'
})

// Pouchdb is used to store all the metadata about files and folders.
// These metadata can come from the local filesystem or the remote cozy instance.
//
// Best practices from:
// http://pouchdb.com/2014/06/17/12-pro-tips-for-better-code-with-pouchdb.html
// http://docs.ehealthafrica.org/couchdb-best-practices/
//
// For naming conventions, we kept those used on cozy and its couchdb. And
// views name are in camelcase (byChecksum, not by-checksum).
class Pouch {
  /*::
  config: Config
  db: PouchDB
  updater: any
  _lock: {id: number, promise: Promise}
  nextLockId: number
  */

  constructor(config) {
    this.config = config
    this.nextLockId = 0
    this._lock = { id: this.nextLockId++, promise: Promise.resolve(null) }
    this.db = new PouchDB(this.config.dbPath)
    this.db.setMaxListeners(100)
    this.db.on('error', err => log.warn(err))
    this.updater = async.queue(async task => {
      const taskDoc = await this.byIdMaybe(task._id)
      if (taskDoc) return this.db.put({ ...task, _rev: taskDoc._rev })
      else return this.db.put(task)
    })

    autoBind(this)
  }

  // Create database and recreate all filters
  async resetDatabase() {
    await this.db.destroy()
    await fse.ensureDir(this.config.dbPath)
    this.db = new PouchDB(this.config.dbPath)
    this.db.setMaxListeners(100)
    this.db.on('error', err => log.warn(err))
    return this.addAllViews()
  }

  lock(component /*: * */) /*: Promise<Function> */ {
    const id = this.nextLockId++
    if (typeof component !== 'string') component = component.constructor.name
    log.trace({ component, lock: { id, state: 'requested' } }, 'lock requested')
    const pCurrent = this._lock.promise
    let _resolve
    const pReleased = new Promise(resolve => {
      _resolve = resolve
    })
    this._lock = { id, promise: pCurrent.then(() => pReleased) }
    return pCurrent.then(() => {
      log.trace({ component, lock: { id, state: 'acquired' } }, 'lock acquired')
      return () => {
        log.trace(
          { component, lock: { id, state: 'released' } },
          'lock released'
        )
        _resolve()
      }
    })
  }

  async runMigrations(migrations /*: Migration[] */) {
    log.info('Running migrations...')
    for (const migration of migrations) {
      let result

      // First attempt
      result = await migrate(migration, this)
      log.info(migrationLog(migration, result))

      if (result.type === MIGRATION_RESULT_FAILED) {
        // Retry in case of failure
        result = await migrate(migration, this)
      }

      if (result.type === MIGRATION_RESULT_FAILED) {
        // Error in case of second failure
        const err = new MigrationFailedError(migration, result.errors)
        log.fatal({ err, sentry: true }, migrationLog(migration, result))
        throw err
      } else {
        log.info(migrationLog(migration, result))
      }
    }
    log.info('Migrations done.')
  }

  /* Mini ODM */

  /* Catch uncaught exceptions raised by PouchDB when calling `allDocs`.
   * It seems to happen when the db is corrupt although this is not completely
   * certain as we could not get known workarounds to work.
   * See https://github.com/pouchdb/pouchdb/issues/4936
   *
   * At least we're raising an error that will be caught by our errors
   * management and block the app with a "Synchronization impossible" status.
   */
  async _allDocs(options) {
    return new Promise(async (resolve, reject) => {
      const uncaughtExceptionHandler = async err => {
        log.error(
          { err, options, sentry: true },
          'uncaughtException in _allDocs. PouchDB db might be corrupt.'
        )
        reject(err)
      }
      process.once('uncaughtException', uncaughtExceptionHandler)

      try {
        const results = await this.db.allDocs(options)
        resolve(results)
      } catch (err) {
        reject(err)
      } finally {
        process.off('uncaughtException', uncaughtExceptionHandler)
      }
    })
  }

  async allDocs() /*: Promise<SavedMetadata[]> */ {
    const results = await this._allDocs({ include_docs: true })
    return Array.from(results.rows)
      .filter(row => !row.key.startsWith('_'))
      .map(row => row.doc)
      .sort(sortByPath)
  }

  async initialScanDocs() /*: Promise<SavedMetadata[]> */ {
    const results = await this._allDocs({ include_docs: true })
    return Array.from(results.rows)
      .filter(
        row =>
          !row.key.startsWith('_') && // Filter out design docs
          !row.doc.deleted && // Filter out docs already marked for deletion
          row.doc.sides &&
          row.doc.sides.local // Keep only docs that have existed locally
      )
      .map(row => row.doc)
      .sort(sortByPath)
  }

  async put /*:: <T: Metadata|SavedMetadata> */(
    doc /*: T */
  ) /*: Promise<SavedMetadata> */ {
    metadata.invariants(doc)
    const { local, remote } = doc.sides
    log.debug(
      { path: doc.path, local, remote, _deleted: doc._deleted, doc },
      'Saving metadata...'
    )
    if (!doc._id) {
      const { id: _id, rev: _rev } = await this.db.post(doc)
      return {
        ...doc,
        _id,
        _rev
      }
    }
    const { id: _id, rev: _rev } = await this.db.put(doc)
    return {
      ...doc,
      _id,
      _rev
    }
  }

  remove(doc /*: SavedMetadata */) /*: Promise<SavedMetadata> */ {
    return this.put(_.defaults({ _deleted: true }, doc))
  }

  // This method lets us completely erase a document from PouchDB while removing
  // all attributes that could get picked up by Sync the next time the document
  // shows up in the changesfeed (erasing documents generates changes) and thus
  // result in an attempt to take action.
  // This method also does not care about invariants like `remove()` does.
  eraseDocument({ _id, _rev } /*: SavedMetadata */) {
    return this.db.put({ _id, _rev, _deleted: true })
  }

  // WARNING: bulkDocs is not a transaction, some updates can be applied while
  // others do not.
  // Make sure lock is acquired before using it to avoid conflict.
  async bulkDocs /*:: <T: Metadata|SavedMetadata> */(docs /*: Array<T> */) {
    for (const doc of docs) {
      metadata.invariants(doc)
      const { path } = doc
      const { local, remote } = doc.sides || {}
      log.debug(
        { path, local, remote, _deleted: doc._deleted, doc },
        'Saving bulk metadata...'
      )
    }
    const results = await this.db.bulkDocs(docs)
    for (let [idx, result] of results.entries()) {
      if (result.error) {
        const err = new PouchError(result)
        const doc = docs[idx]
        log.error(
          { err, path: doc.path, doc, sentry: true },
          'could not save bulk metadata'
        )
        throw err
      }
    }
    return results
  }

  // Run a query and get all the results
  async getAll(
    query,
    params = { include_docs: true }
  ) /*: Promise<SavedMetadata[]> */ {
    try {
      const { rows } = await this.db.query(query, params)
      return rows.filter(row => row.doc != null).map(row => row.doc)
    } catch (err) {
      log.error({ err }, `could not run ${query} query`)
      return []
    }
  }

  // Get current revision for multiple docs by ids as an index id => rev
  // non-existing documents will not be added to the index
  async getAllRevs(paths) /*: Promise<string[]> */ {
    const result = await this.db.query('byPath', {
      keys: paths.map(byPathKey)
    })
    const index = {}
    for (const row of result.rows)
      if (row.value) index[row.key.join('')] = row.value.rev
    return index
  }

  async byIdMaybe(id /*: string */) /*: Promise<?SavedMetadata> */ {
    try {
      return await this.db.get(id)
    } catch (err) {
      if (err.status !== 404) throw err
    }
  }

  // Return all the files with this checksum
  byChecksum(checksum) /*: Promise<SavedMetadata[]> */ {
    let params = {
      key: checksum,
      include_docs: true
    }
    return this.getAll('byChecksum', params)
  }

  // Return all the files and folders in this path, only at first level
  byPath(basePath) /*: Promise<SavedMetadata[]> */ {
    const key =
      basePath === '' ? metadata.id(basePath) : metadata.id(basePath) + path.sep
    const params = {
      startkey: [key, ''],
      endkey: [key, '\ufff0'],
      include_docs: true
    }
    return this.getAll('byPath', params)
  }

  async bySyncedPath(fpath) /*: Promise<?SavedMetadata> */ {
    if (!fpath) {
      return undefined
    }

    const params = {
      key: byPathKey(fpath),
      include_docs: true
    }
    const matches = await this.getAll('byPath', params)
    // TODO: Do we need to handle cases in which we have more than one match?
    // This should probably not happen if we handle correctly id conflicts on
    // Windows and macOS.
    return matches.length ? matches[0] : undefined
  }

  async byLocalPath(fpath) /*: Promise<?SavedMetadata> */ {
    if (!fpath) {
      return undefined
    }

    const params = {
      key: byPathKey(fpath),
      include_docs: true
    }
    const matches = await this.getAll('byLocalPath', params)
    // TODO: Do we need to handle cases in which we have more than one match?
    // This should probably not happen if we handle correctly id conflicts on
    // Windows and macOS.
    return matches.length ? matches[0] : undefined
  }

  // Return all the files and folders in this path, even in subfolders
  async byRecursivePath(
    basePath,
    { descending = false } = {}
  ) /*: Promise<SavedMetadata[]> */ {
    let params
    if (basePath === '') {
      params = { include_docs: true, descending }
    } else {
      const key = metadata.id(basePath + path.sep)
      // XXX: In descending mode, startkey and endkey must be in reversed order
      const startkey = descending ? [key + '\ufff0'] : [key]
      const endkey = descending ? [key] : [key + '\ufff0']
      params = {
        startkey,
        endkey,
        descending,
        include_docs: true
      }
    }

    return await this.getAll('byPath', params)
  }

  // Return the file/folder with this remote id
  async byRemoteId(id) /*: Promise<SavedMetadata> */ {
    const params = {
      key: id,
      include_docs: true
    }
    const { rows } = await this.db.query('byRemoteId', params)
    if (rows.length === 0) {
      throw { status: 404, message: 'missing' }
    } else {
      return rows[0].doc
    }
  }

  async byRemoteIdMaybe(id) /*: Promise<?SavedMetadata> */ {
    try {
      return await this.byRemoteId(id)
    } catch (err) {
      if (err && err.status !== 404) {
        throw err
      }
    }
  }

  async allByRemoteIds(
    remoteIds /*: string[]|Set<string> */
  ) /* Promise<SavedMetadata[]> */ {
    const params = { keys: Array.from(remoteIds), include_docs: true }
    const results = await this.db.query('byRemoteId', params)
    return results.rows.map(row => row.doc)
  }

  /* Views */

  // Create all required views in the database
  addAllViews() {
    return new Promise((resolve, reject) => {
      async.series(
        [
          this.addByPathView,
          this.addByLocalPathView,
          this.addByChecksumView,
          this.addByRemoteIdView
        ],
        err => {
          if (err) reject(err)
          else resolve()
        }
      )
    })
  }

  // Create a view to find records based on their `path` attribute via a
  // composite key.
  // The key is separated in two parts:
  // - the parent path
  // - the document's name
  // This allows us to either fetch documents via their full path or their
  // parent path, recursively or not.
  // The parent path of a document in the root folder will be '', not '.' as
  // with Node's path.dirname() result.
  async addByPathView() {
    const sep = JSON.stringify(path.sep)
    let normalized
    switch (process.platform) {
      case 'darwin':
        normalized = "doc.path.normalize('NFD').toUpperCase()"
        break
      case 'win32':
        normalized = 'doc.path.toUpperCase()'
        break
      default:
        normalized = 'doc.path'
    }
    const query = `function(doc) {
      if ('path' in doc) {
        let normalized = ${normalized}
        const parts = normalized.split(${sep})
        const name = parts.pop()
        const parentPath = parts.concat('').join(${sep})

        return emit([parentPath, name], { rev: doc._rev })
      }
    }`
    await this.createDesignDoc('byPath', query)
  }

  // Create a view to find records based on their `local.path` attribute via a
  // composite key.
  // The key is separated in two parts:
  // - the parent path
  // - the document's name
  // This allows us to either fetch documents via their full path or their
  // parent path, recursively or not.
  // The parent path of a document in the root folder will be '', not '.' as
  // with Node's path.dirname() result.
  async addByLocalPathView() {
    const sep = JSON.stringify(path.sep)
    let normalized
    switch (process.platform) {
      case 'darwin':
        normalized = "doc.local.path.normalize('NFD').toUpperCase()"
        break
      case 'win32':
        normalized = 'doc.local.path.toUpperCase()'
        break
      default:
        normalized = 'doc.local.path'
    }
    const query = `function(doc) {
      if ('local' in doc && 'path' in doc.local) {
        let normalized = ${normalized}
        const parts = normalized.split(${sep})
        const name = parts.pop()
        const parentPath = parts.concat('').join(${sep})

        return emit([parentPath, name], { rev: doc._rev })
      }
    }`
    await this.createDesignDoc('byLocalPath', query)
  }

  // Create a view to find files by their checksum
  async addByChecksumView() {
    /* !pragma no-coverage-next */
    /* istanbul ignore next */
    const query = function(doc) {
      if ('md5sum' in doc) {
        // $FlowFixMe
        return emit(doc.md5sum) // eslint-disable-line no-undef
      }
    }.toString()
    await this.createDesignDoc('byChecksum', query)
  }

  // Create a view to find file/folder by their _id on a remote cozy
  async addByRemoteIdView() {
    /* !pragma no-coverage-next */
    /* istanbul ignore next */
    const query = function(doc) {
      if ('remote' in doc) {
        // $FlowFixMe
        return emit(doc.remote._id) // eslint-disable-line no-undef
      }
    }.toString()
    await this.createDesignDoc('byRemoteId', query)
  }

  // Create or update given design doc
  async createDesignDoc(name, query) {
    const doc = {
      _id: `_design/${name}`,
      _rev: null,
      views: {
        [name]: { map: query }
      }
    }
    const designDoc = await this.byIdMaybe(doc._id)
    if (designDoc) doc._rev = designDoc._rev
    if (isEqual(doc, designDoc)) {
      return
    } else {
      await this.db.put(doc)
      log.debug(`Design document created: ${name}`)
    }
  }

  // Remove a design document for a given docType
  async removeDesignDoc(docType) {
    const id = `_design/${docType}`
    const designDoc = await this.db.get(id)
    return this.db.remove(id, designDoc._rev)
  }

  /* Helpers */

  // Retrieve a previous doc revision from its id
  async getPreviousRev(id, revDiff) /*: Promise<SavedMetadata> */ {
    const options = {
      revs: true,
      revs_info: true,
      open_revs: 'all'
    }
    const [{ ok, doc }] = await this.db.get(id, options)
    const { ids, start } = ok._revisions
    const shortRev = start - revDiff
    const revId = ids[revDiff]
    const rev = `${shortRev}-${revId}`

    try {
      return await this.db.get(id, { rev })
    } catch (err) {
      log.debug(
        { path: doc.path, rev, doc },
        'could fetch fetch previous revision'
      )
      throw err
    }
  }

  /* Sequence numbers */

  // Get last local replication sequence,
  // ie the last change from pouchdb that have been applied
  async getLocalSeq() {
    const doc = await this.byIdMaybe('_local/localSeq')
    if (doc) return doc.seq
    else return 0
  }

  // Set last local replication sequence
  // It is saved in PouchDB as a local document
  // See http://pouchdb.com/guides/local-documents.html
  setLocalSeq(seq) {
    const task = {
      _id: '_local/localSeq',
      seq
    }
    return new Promise((resolve, reject) => {
      this.updater.push(task, err => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  // Get last remote replication sequence,
  // ie the last change from couchdb that have been saved in pouch
  async getRemoteSeq() {
    const doc = await this.byIdMaybe('_local/remoteSeq')
    if (doc) return doc.seq
    else return 0
  }

  // Set last remote replication sequence
  // It is saved in PouchDB as a local document
  // See http://pouchdb.com/guides/local-documents.html
  setRemoteSeq(seq) {
    const task = {
      _id: '_local/remoteSeq',
      seq
    }
    return new Promise((resolve, reject) => {
      this.updater.push(task, err => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async unsyncedDocIds() {
    const localSeq = await this.getLocalSeq()
    return new Promise((resolve, reject) => {
      this.db
        .changes({
          since: localSeq,
          filter: '_view',
          view: 'byPath'
        })
        .on('complete', ({ results }) => resolve(results.map(r => r.id)))
        .on('error', err => reject(err))
    })
  }

  // Touch existing documents with the given ids to make sure they appear in the
  // changesfeed.
  // Careful: this will change their _rev value!
  async touchDocs(ids /*: string[] */) {
    const results = await this._allDocs({ include_docs: true, keys: ids })
    return this.bulkDocs(
      Array.from(results.rows)
        .filter(row => row.doc)
        .map(row => row.doc)
    )
  }

  async localTree() /*: Promise<string[]> */ {
    const docs = await this.allDocs()
    return docs.filter(doc => doc.local).map(doc => doc.local.path)
  }
}

const byPathKey = (fpath /*: string */) /*: [string, string] */ => {
  const normalized = metadata.id(fpath)
  const parts = normalized.split(path.sep)
  const name = parts.pop()
  const parentPath = parts.concat('').join(path.sep)

  return [parentPath, name]
}

const sortByPath = (docA, docB) => {
  if (docA.path < docB.path) return -1
  if (docA.path > docB.path) return 1
  return 0
}

module.exports = { Pouch, byPathKey }
