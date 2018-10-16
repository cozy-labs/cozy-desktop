/* @flow */

const autoBind = require('auto-bind')
const CozyClient = require('cozy-client-js').Client
const _ = require('lodash')
const path = require('path')

const { FILES_DOCTYPE, FILE_TYPE } = require('./constants')
const { dropSpecialDocs, jsonApiToRemoteDoc, keepFiles, parentDirIds } = require('./document')
const logger = require('../logger')

const { posix } = path

/*::
import type Config from '../config'
import type { Readable } from 'stream'
import type { RemoteDoc, RemoteDeletion } from './document'
import type { Warning } from './warning'

type ContentMismatch = {
  md5sum_file: string, // FS/swift
  md5sum_index: string, // couchdb
  size_file: number, // FS/swift
  size_index: number // couchdb
}

type FsckLog = {
  content_mismatch?: ContentMismatch,
  file_doc?: RemoteDoc & {md5sum: string},
  dir_doc?: RemoteDoc,
  is_file: boolean,
  type: string
}

export type ContentMismatchFsckLog = {
  content_mismatch: ContentMismatch,
  file_doc: RemoteDoc & {md5sum: string},
  is_file: true,
  type: 'content_mismatch'
}

*/

const log = logger({
  component: 'RemoteCozy'
})

function DirectoryNotFound (path/*: string */, cozyURL/*: string */) {
  this.name = 'DirectoryNotFound'
  this.message = `Directory ${path} was not found on Cozy ${cozyURL}`
  this.stack = (new Error()).stack
}

// A remote Cozy instance.
//
// This class wraps cozy-client-js to:
//
// - deal with parsing and errors
// - provide custom functions (that may eventually be merged into the lib)
//
class RemoteCozy {
  /*::
  url: string
  client: CozyClient
  */

  constructor (config/*: Config */) {
    this.url = config.cozyUrl
    this.client = new CozyClient({
      cozyURL: this.url,
      oauth: {
        clientParams: config.client,
        storage: config
      }
    })

    autoBind(this)
  }

  createJob (workerType /*: string */, args /*: any */) /*: Promise<*> */ {
    return this.client.jobs.create(workerType, args)
  }

  unregister () /*: Promise<void> */ {
    return this.client.auth.unregisterClient()
  }

  diskUsage () /* Promise<*> */ {
    return this.client.settings.diskUsage()
  }

  createFile (data /*: Readable */,
              options /*: {name: string,
                          dirID?: ?string,
                          contentType?: ?string,
                          lastModifiedDate?: ?Date} */) /*: Promise<RemoteDoc> */ {
    return this.client.files.create(data, options).then(this.toRemoteDoc)
  }

  createDirectory (options /*: {name: string, dirID?: string} */) /*: Promise<RemoteDoc> */ {
    return this.client.files.createDirectory(options).then(this.toRemoteDoc)
  }

  updateFileById (id /*: string */,
                  data /*: Readable */,
                  options /*: {contentType?: ?string,
                               lastModifiedDate?: ?Date} */) /*: Promise<RemoteDoc> */ {
    return this.client.files.updateById(id, data, options).then(this.toRemoteDoc)
  }

  updateAttributesById (id /*: string */,
                        attrs /*: Object */,
                        options /*: ?{ifMatch?: string} */) /*: Promise<RemoteDoc> */ {
    return this.client.files.updateAttributesById(id, attrs, options).then(this.toRemoteDoc)
  }

  trashById (id /*: string */, options /*: ?{ifMatch: string} */) /*: Promise<RemoteDoc> */ {
    return this.client.files.trashById(id, options).then(this.toRemoteDoc)
  }

  destroyById (id /*: string */, options /*: ?{ifMatch: string} */) /*: Promise<void> */ {
    return this.client.files.destroyById(id, options)
  }

  async changes (since/*: string */ = '0') /*: Promise<{last_seq: string, docs: Array<RemoteDoc|RemoteDeletion>}> */ {
    const {last_seq, results} = await this.client.data.changesFeed(
      FILES_DOCTYPE, {since, include_docs: true})

    // The stack docs: dirs, files (without a path), deletions
    const rawDocs = dropSpecialDocs(results.map(r => r.doc))

    // The parent dirs for each file, indexed by id
    const fileParentsById = await this.client.data.findMany(FILES_DOCTYPE,
      parentDirIds(keepFiles(rawDocs)))

    // The final docs with their paths (except for deletions)
    let docs /*: Array<RemoteDoc|RemoteDeletion> */ = []

    for (const doc of rawDocs) {
      if (doc.type === FILE_TYPE) {
        // File docs returned by the cozy-stack don't have a path
        const parent = fileParentsById[doc.dir_id]

        if (parent.error || parent.doc == null || parent.doc.path == null) {
          log.error({doc, parent}, 'Could not compute doc path from parent')
          continue
        } else {
          doc.path = path.posix.join(parent.doc.path, doc.name)
        }
      }
      docs.push(doc)
    }

    return {last_seq, docs}
  }

  async find (id/*: string */)/*: Promise<RemoteDoc> */ {
    const doc = await this.client.files.statById(id)
    return this.toRemoteDoc(doc)
  }

  async findMaybe (id/*: string */)/*: Promise<?RemoteDoc> */ {
    try {
      return await this.find(id)
    } catch (err) {
      return null
    }
  }

  async findDirectoryByPath (path/*: string */)/*: Promise<RemoteDoc> */ {
    const index = await this.client.data.defineIndex(FILES_DOCTYPE, ['path'])
    const results = await this.client.data.query(index, {selector: {path}})

    if (results.length === 0) throw new DirectoryNotFound(path, this.url)

    // FIXME: cozy-client-js query results have no _type
    return _.merge({_type: FILES_DOCTYPE}, results[0])
  }

  // FIXME: created_at is returned by some methods, but not all of them

  async findOrCreateDirectoryByPath (path/*: string */)/*: Promise<RemoteDoc> */ {
    try {
      return await this.findDirectoryByPath(path)
    } catch (err) {
      if (!(err instanceof DirectoryNotFound)) throw err
      log.warn({path}, 'Directory not found')

      const name = posix.basename(path)
      const parentPath = posix.dirname(path)
      const parentDir /*: RemoteDoc */ = await this.findOrCreateDirectoryByPath(parentPath)
      const dirID = parentDir._id

      log.info({path, name, dirID}, 'Creating directory...')
      return this.createDirectory({name, dirID})
    }
  }

  async isEmpty (id/*: string */)/*: Promise<boolean> */ {
    const dir = await this.client.files.statById(id)
    if (dir.attributes.type !== 'directory') {
      throw new Error(
        `Cannot check emptiness of directory ${id}: ` +
        `wrong type: ${dir.attributes.type}`)
    }
    return dir.relations('contents').length === 0
  }

  async downloadBinary (id/*: string */)/*: Promise<Readable> */ {
    const resp = await this.client.files.downloadById(id)
    return resp.body
  }

  async toRemoteDoc (doc /*: any */)/*: Promise<RemoteDoc> */ {
    if (doc.attributes) doc = jsonApiToRemoteDoc(doc)
    if (doc.type === FILE_TYPE) await this._setPath(doc)
    return doc
  }

  // Retrieve the path of a remote file doc
  async _setPath (doc /*: any */) /*: Promise<void> */ {
    const parentDir = await this.find(doc.dir_id)
    doc.path = path.posix.join(parentDir.path, doc.name)
  }

  async warnings () /*: Promise<Warning[]> */ {
    const warningsPath = '/settings/warnings'
    try {
      const response = await this.client.fetchJSON('GET', warningsPath)
      log.warn({response}, 'Unexpected warnings response. Assuming no warnings.')
      return []
    } catch (err) {
      const {message, status} = err
      log.debug({status}, warningsPath)
      switch (status) {
        case 402: return JSON.parse(message).errors
        case 404: return []
        default: throw err
      }
    }
  }

  async fetchFileCorruptions () /*: Promise<ContentMismatchFsckLog[]> */ {
    const url = '/files/fsck'
    let fscklogs
    try {
      fscklogs /*: null|FsckLog[] */ = await this.client.fetchJSON('GET', url)
    } catch (err) {
      if (err.status !== 404) throw err
      log.warn(`No ${url} route on old cozy-stack. Skipping.`)
    }
    if (fscklogs == null) return []

    const validContentMismatch = (raw /*: FsckLog */)/*: null|ContentMismatchFsckLog */ => {
      if (raw.is_file && raw.type === 'content_mismatch' && raw.file_doc && raw.content_mismatch && raw.file_doc.md5sum) {
        return {
          content_mismatch: raw.content_mismatch,
          file_doc: raw.file_doc,
          is_file: true,
          type: 'content_mismatch'
        }
      }
      if (raw.is_file && raw.type === 'content_mismatch') log.error({sentry: true, raw}, 'bad fscklog')
      return null
    }

    return fscklogs.map(validContentMismatch).filter(Boolean)
  }
}

module.exports = {
  DirectoryNotFound,
  RemoteCozy
}
