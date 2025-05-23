/**
 * @module core/pouch
 * @flow
 */

const path = require('path')

const async = require('async')
const autoBind = require('auto-bind')
const Promise = require('bluebird')
const fse = require('fs-extra')
const _ = require('lodash')
const { isEqual } = _
const PouchDB = require('pouchdb')

const metadata = require('../metadata')
const { PouchError } = require('./error')
const remoteConstants = require('../remote/constants')
const { logger } = require('../utils/logger')

/*::
import type { Config } from '../config'
import type { Metadata, SavedMetadata } from '../metadata'
import type { Callback } from '../utils/func'

export type PouchRecord = { _id: string, _rev: string, _deleted?: true }
*/

const log = logger({
  component: 'Pouch'
})

const POUCHDB_BATCH_SIZE = 1000

// Pouchdb is used to store all the metadata about files and folders.
// These metadata can come from the local filesystem or the Twake Workplace.
//
// Best practices from:
// http://pouchdb.com/2014/06/17/12-pro-tips-for-better-code-with-pouchdb.html
// http://docs.ehealthafrica.org/couchdb-best-practices/
//
// For naming conventions, we kept those used on Twake Workplace and its
// couchdb. And views name are in camelcase (byChecksum, not by-checksum).
class Pouch {
  /*::
  config: Config
  db: PouchDB
  updater: any
  _lock: {id: number, promise: Promise}
  nextLockId: number
  */

  constructor(config /*: Config */) {
    this.config = config
    this.nextLockId = 0
    this._lock = { id: this.nextLockId++, promise: Promise.resolve(null) }
    this.db = new PouchDB(this.config.dbPath)
    this.db.setMaxListeners(100)
    this.db.on('error', err => log.error(err))
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
    this.db.on('error', err => log.error(err))
    return this.addAllViews()
  }

  lock(component /*: * */) /*: Promise<Function> */ {
    const id = this.nextLockId++
    if (typeof component !== 'string') component = component.constructor.name
    log.trace('lock requested', { component, lock: { id, state: 'requested' } })
    const pCurrent = this._lock.promise
    let _resolve
    const pReleased = new Promise(resolve => {
      _resolve = resolve
    })
    this._lock = { id, promise: pCurrent.then(() => pReleased) }
    return pCurrent.then(() => {
      log.trace('lock acquired', { component, lock: { id, state: 'acquired' } })
      return () => {
        log.trace('lock released', {
          component,
          lock: { id, state: 'released' }
        })
        _resolve()
      }
    })
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
  async _allDocs(options /*: ?{ include_docs: boolean } */) {
    const uncaughtExceptionHandler = err => {
      log.error('uncaughtException in _allDocs. PouchDB db might be corrupt.', {
        err,
        options,
        sentry: true
      })
      throw err
    }
    process.once('uncaughtException', uncaughtExceptionHandler)

    try {
      return await this.db.allDocs(options)
    } finally {
      process.off('uncaughtException', uncaughtExceptionHandler)
    }
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
          !row.doc.trashed && // Filter out docs already marked for deletion
          // Keep only docs that have existed locally
          row.doc.sides &&
          row.doc.sides.local &&
          // Make sure the returned docs do have a local attribute
          row.doc.local
      )
      .map(row => row.doc)
      .sort(sortByPath)
  }

  async put /*:: <T: Metadata|SavedMetadata> */(
    doc /*: T */,
    { checkInvariants = true } /*: { checkInvariants: boolean } */ = {}
  ) /*: Promise<SavedMetadata> */ {
    if (checkInvariants) metadata.invariants(doc)
    log.info('Saving metadata...', {
      path: doc.path,
      _id: doc._id,
      _deleted: doc._deleted,
      doc
    })
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
    log.info('Removing record', { path: doc.path, _id: doc._id, doc })
    return this.put(_.defaults({ _deleted: true }, doc))
  }

  // This method lets us completely erase a document from PouchDB while removing
  // all attributes that could get picked up by Sync the next time the document
  // shows up in the changesfeed (erasing documents generates changes) and thus
  // result in an attempt to take action.
  // This method also does not care about invariants like `remove()` does.
  eraseDocument({ _id, _rev, path } /*: SavedMetadata */) {
    log.info('Erasing record', { path, _id, _rev })
    return this.db.put({ _id, _rev, _deleted: true })
  }

  // This method will completely erase an array of records from PouchDB while
  // removing all their attributes.
  // This method also does not care about invariants like `bulkDocs()` does.
  async eraseDocuments(
    docs /*: $ReadOnlyArray<SavedMetadata> */
  ) /*: Promise<Array<PouchRecord>> */ {
    let results = []
    for (const batch of createBatches(docs, POUCHDB_BATCH_SIZE)) {
      const batchResults = await this._eraseDocuments(
        batch.map(({ _id, _rev }) => ({ _id, _rev, _deleted: true }))
      )
      results = results.concat(batchResults)
    }
    return results
  }

  async _eraseDocuments(docs /*: $ReadOnlyArray<PouchRecord> */) {
    log.info('Erasing bulk records...', { docs })

    const results = await this.db.bulkDocs(docs)
    for (let [idx, result] of results.entries()) {
      if (result.error) {
        const err = new PouchError(result)
        const doc = docs[idx]
        log.error('could not erase bulk record', {
          err,
          path: doc.path,
          doc,
          sentry: true
        })
        throw err
      }
    }
    return results
  }

  // WARNING: bulkDocs is not a transaction, some updates can be applied while
  // others do not.
  // Make sure lock is acquired before using it to avoid conflict.
  async bulkDocs(
    docs /*: $ReadOnlyArray<Metadata|SavedMetadata> */
  ) /*: Promise<Array<SavedMetadata>> */ {
    let results = []
    for (const batch of createBatches(docs, POUCHDB_BATCH_SIZE)) {
      const batchResults = await this._bulkDocs(batch)
      results = results.concat(batchResults)
    }

    return results
  }

  // WARNING: _bulkDocs is not a transaction, some updates can be applied while
  // others do not.
  // Make sure lock is acquired before using it to avoid conflict.
  async _bulkDocs(docs /*: $ReadOnlyArray<Metadata|SavedMetadata> */) {
    log.info('Saving bulk metadata...', { docs })

    for (const doc of docs) {
      metadata.invariants(doc)
    }
    const results = await this.db.bulkDocs(docs)
    for (let [idx, result] of results.entries()) {
      if (result.error) {
        const err = new PouchError(result)
        const doc = docs[idx]
        log.error('could not save bulk metadata', {
          err,
          path: doc.path,
          doc,
          sentry: true
        })
        throw err
      }
    }
    return results
  }

  // Run a query and get all the results
  async getAll(
    query /*: string */,
    params /*: ?{ include_docs: boolean } */ = { include_docs: true }
  ) /*: Promise<SavedMetadata[]> */ {
    try {
      const { rows } = await this.db.query(query, params)
      return rows.filter(row => row.doc != null).map(row => row.doc)
    } catch (err) {
      log.error(`could not run ${query} query`, { err })
      return []
    }
  }

  // Get current revision for multiple docs by ids as an index id => rev
  // non-existing documents will not be added to the index
  async getAllRevs(paths /*: string[] */) /*: Promise<string[]> */ {
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
  byChecksum(checksum /*: string */) /*: Promise<SavedMetadata[]> */ {
    let params = {
      key: checksum,
      include_docs: true
    }
    return this.getAll('byChecksum', params)
  }

  // Return all the files and folders in this path, only at first level
  byPath(basePath /*: string */) /*: Promise<SavedMetadata[]> */ {
    const key =
      basePath === '' ? metadata.id(basePath) : metadata.id(basePath) + path.sep
    const params = {
      startkey: [key, ''],
      endkey: [key, '\ufff0'],
      include_docs: true
    }
    return this.getAll('byPath', params)
  }

  async bySyncedPath(fpath /*: string */) /*: Promise<?SavedMetadata> */ {
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
    return matches && matches.length ? matches[0] : undefined
  }

  async byLocalPath(fpath /*: string */) /*: Promise<?SavedMetadata> */ {
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
    return matches && matches.length ? matches[0] : undefined
  }

  // Return all the files and folders in this path, even in subfolders
  async byRecursivePath(
    basePath /*: string */,
    { descending = false } /*: { descending: boolean } */ = {}
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
  async byRemoteId(id /*: string */) /*: Promise<SavedMetadata> */ {
    const params = {
      key: id,
      include_docs: true
    }
    const { rows } = await this.db.query('byRemoteId', params)
    if (!rows || rows.length === 0) {
      throw { status: 404, message: 'missing' }
    } else {
      return rows[0].doc
    }
  }

  async byRemoteIdMaybe(id /*: string */) /*: Promise<?SavedMetadata> */ {
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

  async needingContentFetching() /*: Promise<SavedMetadata[]> */ {
    return await this.getAll('needsContentFetching')
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
          this.addByRemoteIdView,
          this.addNeedsContentFetchingView
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

  // Create a view to find file/folder by their _id on a Twake Workplace
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

  async addNeedsContentFetchingView() {
    const query = function(doc) {
      if (doc.needsContentFetching && !doc.trashed) {
        // $FlowFixMe
        return emit(doc._id) // eslint-disable-line no-undef
      }
    }.toString()
    await this.createDesignDoc('needsContentFetching', query)
  }

  // Create or update given design doc
  async createDesignDoc(name /*: string */, query /*: string */) {
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
      log.trace(`Design document created: ${name}`)
    }
  }

  // Remove a design document for a given docType
  async removeDesignDoc(docType /*: string */) {
    const id = `_design/${docType}`
    const designDoc = await this.db.get(id)
    return this.db.remove(id, designDoc._rev)
  }

  /* Helpers */

  // Retrieve a previous doc revision from its id
  async getPreviousRev(
    id /*: string */,
    revDiff /*: number */
  ) /*: Promise<SavedMetadata> */ {
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
      log.error('could not fetch previous revision', {
        path: doc.path,
        _id: doc._id,
        rev,
        doc
      })
      throw err
    }
  }

  /* Sequence numbers */

  // Get last local replication sequence,
  // ie the last change from pouchdb that have been applied
  async getLocalSeq() /*: Promise<number> */ {
    const doc = await this.byIdMaybe('_local/localSeq')
    if (doc) return doc.seq
    else return 0
  }

  // Set last local replication sequence
  // It is saved in PouchDB as a local document
  // See http://pouchdb.com/guides/local-documents.html
  setLocalSeq(seq /*: number */) {
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
  async getRemoteSeq() /*: Promise<string> */ {
    const doc = await this.byIdMaybe('_local/remoteSeq')
    if (doc) return doc.seq
    else return remoteConstants.INITIAL_SEQ
  }

  // Set last remote replication sequence
  // It is saved in PouchDB as a local document
  // See http://pouchdb.com/guides/local-documents.html
  setRemoteSeq(seq /*: string */) {
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

const sortByPath = (docA /*: SavedMetadata */, docB /*: SavedMetadata */) => {
  if (docA.path < docB.path) return -1
  if (docA.path > docB.path) return 1
  return 0
}

const createBatches = /*::<T: Metadata|SavedMetadata> */ (
  docs /*: $ReadOnlyArray<T> */,
  batchSize /*: number */
) /*: Array<Array<T>> */ => {
  if (batchSize <= 0) return [[...docs]]

  let batches /*: Array<Array<T>> */ = []
  for (let i = 0; i < docs.length / batchSize; i++) {
    const batch = docs.slice(i * batchSize, (i + 1) * batchSize)
    batches.push(batch)
  }
  return batches
}

module.exports = { Pouch, byPathKey, sortByPath, createBatches }
