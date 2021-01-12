/**
 * @module core/remote/cozy
 * @flow
 */

const autoBind = require('auto-bind')
const OldCozyClient = require('cozy-client-js').Client
const CozyClient = require('cozy-client').default
const { FetchError } = require('cozy-stack-client')
const _ = require('lodash')
const path = require('path')
const {
  AbortController
} = require('abortcontroller-polyfill/dist/cjs-ponyfill')

const { FILES_DOCTYPE, FILE_TYPE, DIR_TYPE } = require('./constants')
const {
  dropSpecialDocs,
  jsonApiToRemoteDoc,
  keepFiles,
  parentDirIds
} = require('./document')
const logger = require('../utils/logger')

const { posix } = path

/*::
import type { Config } from '../config'
import type { Readable } from 'stream'
import type { JsonApiDoc, RemoteDoc, RemoteFile, RemoteDir, RemoteDeletion } from './document'
import type { MetadataRemoteInfo, MetadataRemoteFile, MetadataRemoteDir } from '../metadata'

export type Warning = {
  status: number,
  title: string,
  code: string,
  detail: string,
  links: {
    self: string
  }
}
export type Reference = {
  id: string,
  type: string
}
*/

const log = logger({
  component: 'RemoteCozy'
})

class DirectoryNotFound extends Error {
  /*::
  path: string
  cozyURL: string
  */

  constructor(path /*: string */, cozyURL /*: string */) {
    super(`Directory ${path} was not found on Cozy ${cozyURL}`)

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DirectoryNotFound)
    }

    this.name = 'DirectoryNotFound'
    this.path = path
    this.cozyURL = cozyURL
  }
}

/** A remote Cozy instance.
 *
 * This class wraps cozy-client-js to:
 *
 * - deal with parsing and errors
 * - provide custom functions (that may eventually be merged into the lib)
 */
class RemoteCozy {
  /*::
  url: string
  client: OldCozyClient
  */

  constructor(config /*: Config */) {
    this.url = config.cozyUrl
    this.client = new OldCozyClient({
      cozyURL: this.url,
      oauth: {
        clientParams: config.client,
        storage: config
      }
    })

    autoBind(this)
  }

  async newClient() /*: Promise<CozyClient>  */ {
    if (this.client._oauth) {
      return await CozyClient.fromOldOAuthClient(this.client)
    } else {
      return await CozyClient.fromOldClient(this.client)
    }
  }

  createJob(workerType /*: string */, args /*: any */) /*: Promise<*> */ {
    return this.client.jobs.create(workerType, args)
  }

  unregister() /*: Promise<void> */ {
    return this.client.auth.unregisterClient()
  }

  update() /*: Promise<void> */ {
    return this.client.auth.updateClient()
  }

  diskUsage() /* Promise<*> */ {
    return this.client.settings.diskUsage()
  }

  hasEnoughSpace(size /*: number */) /*: Promise<boolean> */ {
    return this.diskUsage().then(
      ({ attributes: { used, quota } }) => !quota || +quota - +used >= size
    )
  }

  updateLastSync() /*: Promise<void> */ {
    return this.client.settings.updateLastSync()
  }

  // Catches unhandled and cryptic promise rejections thrown during requests
  // made to the remote Cozy by the underlying network stack
  // (i.e. Electron/Chromium) and rejects our request promise with a domain
  // error instead.
  //
  // When a chunk encoded request, sent via HTTP/2 fails and the remote Cozy
  // returns an error (e.g. 413 because the file is too large), Chromium will
  // replace the response header status with a simple
  // `net:ERR_HTTP2_PROTOCOL_ERROR`, leaving us with no information about the
  // reason why the request failed.
  // See https://bugs.chromium.org/p/chromium/issues/detail?id=1033945
  //
  // Besides, in this situation, Electron will reject a promise with a
  // `mojo result is not ok` error message in a way that does not let us catch
  // it.
  // See https://github.com/electron/electron/blob/1719f073c1c97c5b421194f9bf710509f4d464d5/shell/browser/api/electron_api_url_loader.cc#L190.
  // Our only recourse here is to make use of the Node's `unhandledRejection`
  // event handler to reject our own request and make sure the client does not
  // hang forever on this failed request.
  //
  // To make sense of the situation, we run checks on the remote Cozy to try
  // and recreate the error that was returned by the remote Cozy and take
  // appropriate action down the Sync process.
  _withUnhandledRejectionProtection(
    options /*: Object */,
    fn /*: () => Promise<MetadataRemoteInfo> */
  ) /*: Promise<MetadataRemoteInfo> */ {
    return new Promise((resolve, reject) => {
      const abortController = new AbortController()
      options.signal = abortController.signal

      const unhandledRejectionHandler = async err => {
        try {
          const { name, dirID: dir_id, contentLength } = options

          if (name && dir_id && (await this.isNameTaken({ name, dir_id }))) {
            err = new FetchError(
              { url: '', status: 409 },
              'Conflict: name already taken'
            )
          } else if (!(await this.hasEnoughSpace(contentLength))) {
            err = new FetchError(
              { url: '', status: 413 },
              'The file is too big and exceeds the disk quota'
            )
          }
          // Reject our domain function call
          reject(err)
        } catch (err) {
          // Reject our domain function call
          reject(err)
        } finally {
          // Abort the underlying fetch request in case we caught an unrelated
          // unhandled promise rejection and still reject the domain request.
          abortController.abort()
        }
      }
      process.once('unhandledRejection', unhandledRejectionHandler)

      fn().then(
        result => {
          process.off('unhandledRejection', unhandledRejectionHandler)
          resolve(result)
        },
        err => {
          process.off('unhandledRejection', unhandledRejectionHandler)
          reject(err)
        }
      )
    })
  }

  async createFile(
    data /*: Readable */,
    options /*: {|name: string,
                 dirID: string,
                 contentType: string,
                 contentLength: number,
                 checksum: string,
                 createdAt: string,
                 updatedAt: string,
                 executable: boolean|} */
  ) /*: Promise<MetadataRemoteInfo> */ {
    return this._withUnhandledRejectionProtection(options, async () => {
      const file = await this.client.files.create(data, options)
      return this.toRemoteDoc(file)
    })
  }

  async createDirectory(
    options /*: {|name: string,
                 dirID?: string,
                 createdAt: string,
                 updatedAt: string|} */
  ) /*: Promise<MetadataRemoteInfo> */ {
    const folder = await this.client.files.createDirectory(options)
    return this.toRemoteDoc(folder)
  }

  async updateFileById(
    id /*: string */,
    data /*: Readable */,
    options /*: {|contentType: string,
                 contentLength: number,
                 checksum: string,
                 updatedAt: string,
                 executable: boolean,
                 ifMatch: string|} */
  ) /*: Promise<MetadataRemoteInfo> */ {
    return this._withUnhandledRejectionProtection(options, async () => {
      const updated = await this.client.files.updateById(id, data, options)
      return this.toRemoteDoc(updated)
    })
  }

  async updateAttributesById(
    id /*: string */,
    attrs /*: {|name?: string,
               dir_id?: string,
               executable?: boolean,
               updated_at: string|} */,
    options /*: {|ifMatch: string|} */
  ) /*: Promise<MetadataRemoteInfo> */ {
    const updated = await this.client.files.updateAttributesById(
      id,
      attrs,
      options
    )
    return this.toRemoteDoc(updated)
  }

  async trashById(
    id /*: string */,
    options /*: {|ifMatch: string|} */
  ) /*: Promise<MetadataRemoteInfo> */ {
    const trashed = await this.client.files.trashById(id, options)
    return this.toRemoteDoc(trashed)
  }

  destroyById(
    id /*: string */,
    options /*: {|ifMatch: string|} */
  ) /*: Promise<void> */ {
    return this.client.files.destroyById(id, options)
  }

  async changes(
    since /*: string */ = '0'
  ) /*: Promise<{last_seq: string, docs: Array<MetadataRemoteInfo|RemoteDeletion>}> */ {
    const { last_seq, results } = await getChangesFeed(since, this.client)

    // The stack docs: dirs, files (without a path), deletions
    const rawDocs /*: RemoteDoc[] */ = dropSpecialDocs(results.map(r => r.doc))

    // The parent dirs for each file, indexed by id
    const fileParentsById = await this.client.data.findMany(
      FILES_DOCTYPE,
      parentDirIds(keepFiles(rawDocs))
    )

    // The final docs with their paths (except for deletions)
    const remoteDocs /*: Array<MetadataRemoteInfo|RemoteDeletion> */ = []

    for (const remoteDoc of rawDocs) {
      if (remoteDoc.type === FILE_TYPE) {
        // File docs returned by the cozy-stack don't have a path
        const parent = fileParentsById[remoteDoc.dir_id]

        if (parent.error || parent.doc == null || parent.doc.path == null) {
          log.error(
            { err: parent.error, remoteDoc, parent, sentry: true },
            'Could not compute doc path from parent'
          )
          continue
        } else {
          remoteDocs.push(this._withPath(remoteDoc, parent.doc))
        }
      } else {
        remoteDocs.push(remoteDoc)
      }
    }

    return { last_seq, docs: remoteDocs }
  }

  async find(id /*: string */) /*: Promise<MetadataRemoteInfo> */ {
    return this.toRemoteDoc(await this.client.files.statById(id))
  }

  async findDir(id /*: string */) /*: Promise<RemoteDir> */ {
    const remoteDir = await this.client.files.statById(id)
    const doc = await this.toRemoteDoc(remoteDir)
    if (doc.type !== DIR_TYPE) {
      throw new Error(`Unexpected file with remote _id ${id}`)
    }
    return doc
  }

  async findMaybe(id /*: string */) /*: Promise<?RemoteDoc> */ {
    try {
      return await this.find(id)
    } catch (err) {
      return null
    }
  }

  async isNameTaken(
    { name, dir_id } /*: { name: string, dir_id: string } */
  ) /*: Promise<boolean> */ {
    const index = await this.client.data.defineIndex(FILES_DOCTYPE, [
      'dir_id',
      'name'
    ])
    const results = await this.client.data.query(index, {
      selector: { dir_id, name }
    })

    return results.length !== 0
  }

  async findDirectoryByPath(path /*: string */) /*: Promise<RemoteDir> */ {
    const index = await this.client.data.defineIndex(FILES_DOCTYPE, ['path'])
    const results = await this.client.data.query(index, { selector: { path } })

    if (results.length === 0) throw new DirectoryNotFound(path, this.url)

    // FIXME: cozy-client-js query results have no _type
    return _.merge({ _type: FILES_DOCTYPE }, results[0])
  }

  // FIXME: created_at is returned by some methods, but not all of them

  async findOrCreateDirectoryByPath(
    path /*: string */
  ) /*: Promise<MetadataRemoteInfo> */ {
    try {
      return await this.findDirectoryByPath(path)
    } catch (err) {
      if (!(err instanceof DirectoryNotFound)) throw err
      log.warn({ path }, 'Directory not found')

      const name = posix.basename(path)
      const parentPath = posix.dirname(path)
      const parentDir /*: RemoteDoc */ = await this.findOrCreateDirectoryByPath(
        parentPath
      )
      const dirID = parentDir._id
      const createdAt = new Date().toISOString()

      log.info({ path, name, dirID }, 'Creating directory...')
      return this.createDirectory({
        name,
        dirID,
        createdAt,
        updatedAt: createdAt
      })
    }
  }

  async isEmpty(id /*: string */) /*: Promise<boolean> */ {
    const dir = await this.client.files.statById(id)
    if (dir.attributes.type !== 'directory') {
      throw new Error(
        `Cannot check emptiness of directory ${id}: ` +
          `wrong type: ${dir.attributes.type}`
      )
    }
    return dir.relations('contents').length === 0
  }

  async downloadBinary(id /*: string */) /*: Promise<Readable> */ {
    const resp = await this.client.files.downloadById(id)
    return resp.body
  }

  async toRemoteDoc(doc /*: JsonApiDoc */) /*: Promise<MetadataRemoteInfo> */ {
    const remoteDoc /*: RemoteDoc */ = jsonApiToRemoteDoc(doc)
    if (remoteDoc.type === FILE_TYPE) {
      const parentDir /*: RemoteDir */ = await this.findDir(remoteDoc.dir_id)
      return this._withPath(remoteDoc, parentDir)
    }
    return (remoteDoc /*: MetadataRemoteDir */)
  }

  /** Set the path of a remote file doc. */
  _withPath(
    doc /*: RemoteFile */,
    parentDir /*: RemoteDir */
  ) /*: MetadataRemoteFile */ {
    return {
      ...doc,
      path: path.posix.join(parentDir.path, doc.name)
    }
  }

  async warnings() /*: Promise<Warning[]> */ {
    const warningsPath = '/settings/warnings'
    try {
      const response = await this.client.fetchJSON('GET', warningsPath)
      log.warn(
        { response },
        'Unexpected warnings response. Assuming no warnings.'
      )
      return []
    } catch (err) {
      const { message, status } = err
      log.debug({ status }, warningsPath)
      switch (status) {
        case 402:
          return JSON.parse(message).errors
        case 404:
          return []
        default:
          throw err
      }
    }
  }

  async capabilities() /*: Promise<{ flatSubdomains: boolean }> */ {
    const client = await this.newClient()
    const {
      data: {
        attributes: { flat_subdomains: flatSubdomains }
      }
    } = await client.query(client.get('io.cozy.settings', 'capabilities'))
    return { flatSubdomains }
  }

  async getReferencedBy(id /*: string */) /*: Promise<Reference[]> */ {
    const client = await this.newClient()
    const files = client.collection(FILES_DOCTYPE)
    const { data } = await files.get(id)
    return (
      (data &&
        data.relationships &&
        data.relationships.referenced_by &&
        data.relationships.referenced_by.data) ||
      []
    )
  }

  async addReferencedBy(
    _id /*: string */,
    referencedBy /*: Reference[] */
  ) /*: Promise<{_rev: string, referencedBy: Reference[] }> */ {
    const client = await this.newClient()
    const files = client.collection(FILES_DOCTYPE)
    const doc = { _id, _type: FILES_DOCTYPE }
    const references = referencedBy.map(ref => ({
      _id: ref.id,
      _type: ref.type
    }))
    const {
      meta: { rev: _rev },
      data
    } = await files.addReferencedBy(doc, references)
    return { _rev, referencedBy: data }
  }
}

module.exports = {
  DirectoryNotFound,
  RemoteCozy
}

async function getChangesFeed(
  since /*: string */,
  client /*: OldCozyClient */
) /*: Promise<{ pending: number, last_seq: string, results: Array<{ doc: RemoteDoc }> }> */ {
  const response = await client.data.changesFeed(FILES_DOCTYPE, {
    since,
    include_docs: true,
    limit: 10000
  })
  const { last_seq, pending, results } = response
  if (pending === 0) {
    return response
  }
  const nextResponse = await getChangesFeed(last_seq, client)
  return {
    ...nextResponse,
    results: [...results, ...nextResponse.results]
  }
}
