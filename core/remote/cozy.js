/**
 * @module core/remote/cozy
 * @flow
 */

const path = require('path')

const autoBind = require('auto-bind')
const addSecretEventListener = require('secret-event-listener')

const CozyClient = require('cozy-client').default
const { Q } = require('cozy-client')
const OldCozyClient = require('cozy-client-js').Client
const cozyFlags = require('cozy-flags').default
const { FetchError } = require('cozy-stack-client')

const {
  FILES_DOCTYPE,
  FILE_TYPE,
  DIR_TYPE,
  INITIAL_SEQ,
  JOBS_DOCTYPE,
  MAX_FILE_SIZE,
  OAUTH_CLIENTS_DOCTYPE,
  SETTINGS_DOCTYPE,
  VERSIONS_DOCTYPE
} = require('./constants')
const {
  dropSpecialDocs,
  withDefaultValues,
  remoteJsonToRemoteDoc,
  jsonApiToRemoteDoc,
  jsonApiToRemoteJsonDoc,
  jsonFileVersionToRemoteFileVersion
} = require('./document')
const { DirectoryNotFound } = require('./errors')
const { sortBy } = require('../utils/array')
const { logger } = require('../utils/logger')

/*::
import type { CozyRealtime } from 'cozy-realtime'
import type { Readable } from 'stream'

import type { Config } from '../config'
import type {
  CouchDBDeletion,
  CouchDBDoc,
  CouchDBFile,
  FullRemoteFile,
  RemoteJsonDoc,
  RemoteJsonFile,
  RemoteJsonDir,
  RemoteFile,
  RemoteFileVersion,
  RemoteDir,
} from './document'
import type {
  MetadataRemoteDir,
  MetadataRemoteFile
} from '../metadata'

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

type ChangesFeedResponse = Promise<{
  last_seq: string,
  docs: $ReadOnlyArray<CouchDBDoc|CouchDBDeletion>,
  isInitialFetch: boolean
}>
*/

const log = logger({
  component: 'RemoteCozy'
})

/** A remote Cozy instance.
 *
 * This class wraps cozy-client-js to:
 *
 * - deal with parsing and errors
 * - provide custom functions (that may eventually be merged into the lib)
 */
class RemoteCozy {
  /*::
  config: Config
  url: string
  client: OldCozyClient
  newClient: ?CozyClient
  */

  constructor(config /*: Config */) {
    this.config = config
    this.url = config.cozyUrl
    this.client = new OldCozyClient({
      version: 3,
      cozyURL: this.url,
      oauth: {
        clientParams: config.client,
        storage: config
      }
    })

    autoBind(this)
  }

  // FIXME: setup can be done multiple times if getClient() is called multiple times concurrently.
  // Use lock?! Separate setup from getter ?!
  async getClient() /*: Promise<CozyClient> */ {
    if (this.newClient != null) {
      return this.newClient
    }

    if (this.client._oauth) {
      // Make sure we have an authorized client to build a new client from.
      await this.client.authorize()
      this.newClient = await CozyClient.fromOldOAuthClient(this.client, {
        throwFetchErrors: true
      })
    } else {
      this.newClient = await CozyClient.fromOldClient(this.client, {
        throwFetchErrors: true
      })
    }

    return this.newClient
  }

  async createJob(workerType /*: string */, args /*: any */) /*: Promise<*> */ {
    const client = await this.getClient()
    return client.collection(JOBS_DOCTYPE).create(workerType, args)
  }

  unregister() /*: Promise<void> */ {
    return this.client.auth.unregisterClient()
  }

  update() /*: Promise<void> */ {
    return this.client.auth.updateClient()
  }

  async diskUsage() /* Promise<{ quota: number, used: number }> */ {
    const client = await this.getClient()
    const {
      data: { attributes }
    } = await client
      .collection(SETTINGS_DOCTYPE)
      .get(`${SETTINGS_DOCTYPE}.disk-usage`)
    return attributes
  }

  async hasEnoughSpace(size /*: number */) /*: Promise<boolean> */ {
    const { used, quota } = await this.diskUsage()
    return !quota || +quota - +used >= size
  }

  async updateLastSynced() /*: Promise<void> */ {
    const client = await this.getClient()
    return client.collection(SETTINGS_DOCTYPE).updateLastSynced()
  }

  // Catches cryptic errors thrown during requests made to the remote Cozy by
  // the underlying network stack (i.e. Electron/Chromium) and rejects our
  // request promise with a domain error instead.
  //
  // When a chunk encoded request, sent via HTTP/2 fails and the remote Cozy
  // returns an error (e.g. 413 because the file is too large), Chromium will
  // replace the response header status with a simple
  // `net:ERR_HTTP2_PROTOCOL_ERROR`, leaving us with no information about the
  // reason why the request failed.
  // See https://bugs.chromium.org/p/chromium/issues/detail?id=1033945
  //
  // Besides, in this situation, Electron will reject a promise with a
  // `mojo result is not ok` error message.
  // See https://github.com/electron/electron/blob/1719f073c1c97c5b421194f9bf710509f4d464d5/shell/browser/api/electron_api_url_loader.cc#L190.
  //
  // To make sense of the situation, we run checks on the remote Cozy to try
  // and recreate the error that was returned by the remote Cozy and take
  // appropriate action down the Sync process.
  async _withDomainErrors /*:: <T: FullRemoteFile|RemoteDir> */(
    data /*: Readable */,
    options /*: Object */,
    fn /*: () => Promise<T> */
  ) /*: Promise<T> */ {
    let readBytes = 0

    const domainError = async () => {
      try {
        const { name, dirID: dir_id, contentLength } = options

        if (name && dir_id && (await this.isNameTaken({ name, dir_id }))) {
          return new FetchError({ status: 409 }, 'Conflict: name already taken')
        } else if (
          contentLength > MAX_FILE_SIZE ||
          !(await this.hasEnoughSpace(contentLength))
        ) {
          return new FetchError(
            { status: 413 },
            'The file is too big or exceeds the disk quota'
          )
        } else if (readBytes !== contentLength) {
          const errBody = {
            status: 412,
            reason: {
              errors: [
                {
                  status: 412,
                  title: 'Precondition Failed',
                  detail: 'Content length does not match',
                  source: { parameter: 'Content-Length' }
                }
              ]
            }
          }
          return new FetchError(errBody, JSON.stringify(errBody))
        }
      } catch (err) {
        return err
      }
    }

    try {
      // We use a secret event listener otherwise the data will start flowing
      // before `cozy-client-js` starts handling it and we'll lose chunks.
      // See https://nodejs.org/docs/latest-v12.x/api/stream.html#stream_event_data
      // for more details.
      addSecretEventListener(data, 'data', chunk => {
        readBytes += chunk.length
      })

      return await new Promise((resolve, reject) => {
        data.on('error', err => {
          reject(err)
        })

        fn()
          .then(result => resolve(result))
          .catch(err => reject(err))
      })
    } catch (err) {
      if (
        err.code === 'ERR_HTTP2_PROTOCOL_ERROR' ||
        /mojo result/.test(err.message)
      ) {
        const cozyErr = await domainError()
        if (cozyErr) {
          // Reject our domain function call
          throw cozyErr
        }
      }
      throw err
    }
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
  ) /*: Promise<FullRemoteFile|RemoteDir> */ {
    return this._withDomainErrors(data, options, async () => {
      const file /* RemoteJsonFile*/ = await this.client.files.create(data, {
        ...options,
        noSanitize: true
      })
      return this.toRemoteDoc(remoteJsonToRemoteDoc(file))
    })
  }

  async createDirectory(
    options /*: {|name: string,
                 dirID?: string,
                 createdAt: string,
                 updatedAt: string|} */
  ) /*: Promise<FullRemoteFile|RemoteDir> */ {
    const folder /*: RemoteJsonDir */ = await this.client.files.createDirectory(
      {
        ...options,
        noSanitize: true
      }
    )
    return this.toRemoteDoc(remoteJsonToRemoteDoc(folder))
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
  ) /*: Promise<FullRemoteFile|RemoteDir> */ {
    return this._withDomainErrors(data, options, async () => {
      const updated /*: RemoteJsonFile */ = await this.client.files.updateById(
        id,
        data,
        {
          ...options,
          noSanitize: true
        }
      )
      return this.toRemoteDoc(remoteJsonToRemoteDoc(updated))
    })
  }

  async updateAttributesById(
    id /*: string */,
    attrs /*: {|name?: string,
               dir_id?: string,
               executable?: boolean,
               updated_at: string|} */,
    options /*: {|ifMatch: string|} */
  ) /*: Promise<FullRemoteFile|RemoteDir> */ {
    const updated = await this.client.files.updateAttributesById(id, attrs, {
      ...options,
      noSanitize: true
    })
    return this.toRemoteDoc(remoteJsonToRemoteDoc(updated))
  }

  async trashById(
    _id /*: string */,
    options /*: {|ifMatch: string|} */
  ) /*: Promise<FullRemoteFile|RemoteDir> */ {
    const client = await this.getClient()
    // TODO: include relationships or referenced_by to first argument so
    // cozy-client can make sure they're removed.
    // Make sure we don't need them though.
    const { data: trashed } = await client
      .collection(FILES_DOCTYPE)
      .destroy({ _id }, options)
    return this.toRemoteDoc(jsonApiToRemoteDoc(trashed))
  }

  async changes(
    since /*: string */ = INITIAL_SEQ,
    batchSize /*: number */ = 3000
  ) /*: ChangesFeedResponse */ {
    const client = await this.getClient()
    const isInitialFetch = since === INITIAL_SEQ
    const { last_seq, remoteDocs } = isInitialFetch
      ? await fetchInitialChanges(since, client, batchSize)
      : await fetchChangesFromFeed(since, client, batchSize)

    const docs = sortByPath(dropSpecialDocs(remoteDocs))

    return { last_seq, docs, isInitialFetch }
  }

  async fetchLastSeq() {
    const client = await this.getClient()
    const { last_seq } = await client
      .collection(FILES_DOCTYPE)
      .fetchChangesRaw({
        since: INITIAL_SEQ,
        descending: true,
        limit: 1,
        includeDocs: false
      })
    return last_seq
  }

  async find(id /*: string */) /*: Promise<FullRemoteFile|RemoteDir> */ {
    const client = await this.getClient()
    const { data: doc } = await client.collection(FILES_DOCTYPE).statById(id)
    return this.toRemoteDoc(jsonApiToRemoteDoc(doc))
  }

  async findMaybe(
    id /*: string */
  ) /*: Promise<?(FullRemoteFile|RemoteDir)> */ {
    try {
      return await this.find(id)
    } catch (err) {
      if (err.status === 404) return null
      else throw err
    }
  }

  async findDir(id /*: string */) /*: Promise<RemoteDir> */ {
    const doc = await this.find(id)
    if (doc.type !== DIR_TYPE) {
      throw new Error(`Unexpected file with remote _id ${id}`)
    }
    return doc
  }

  async findDirMaybe(id /*: string */) /*: Promise<?RemoteDir> */ {
    try {
      return await this.findDir(id)
    } catch (err) {
      if (err.status === 404) return null
      else throw err
    }
  }

  async isNameTaken(
    { name, dir_id } /*: { name: string, dir_id: string } */
  ) /*: Promise<boolean> */ {
    const client = await this.getClient()
    const { data } = await client.query(
      Q(FILES_DOCTYPE).where({ dir_id, name })
    )
    return data.length !== 0
  }

  async search(
    selector /*: Object */
  ) /*: Promise<(FullRemoteFile|RemoteDir)[]> */ {
    const index = await this.client.data.defineIndex(
      FILES_DOCTYPE,
      Object.keys(selector)
    )
    const results = await this.client.data.query(index, { selector })
    return Promise.all(
      results.map(async result => {
        if (result.type === FILE_TYPE) {
          const parentDir /*: RemoteDir */ = await this.findDir(result.dir_id)
          return this._withPath(withDefaultValues(result), parentDir)
        }
        return withDefaultValues(result)
      })
    )
  }

  async findMaybeByPath(
    path /*: string */
  ) /*: Promise<?FullRemoteFile|RemoteDir> */ {
    const client = await this.getClient()
    try {
      const { data } = await client.collection(FILES_DOCTYPE).statByPath(path)
      return this.toRemoteDoc(jsonApiToRemoteDoc(data))
    } catch (err) {
      if (err.status === 404) return null
      else throw err
    }
  }

  // TODO: remove as it is used only by `RemoteTestHelpers`
  async findDirectoryByPath(path /*: string */) /*: Promise<RemoteDir> */ {
    const client = await this.getClient()
    try {
      const { data } = await client.collection(FILES_DOCTYPE).statByPath(path)

      const remoteDoc = await this.toRemoteDoc(jsonApiToRemoteDoc(data))
      if (remoteDoc.type === DIR_TYPE) return remoteDoc

      throw new DirectoryNotFound(path, this.url)
    } catch (err) {
      if (err.status === 404) {
        throw new DirectoryNotFound(path, this.url)
      }
      throw err
    }
  }

  // XXX: This only fetches the direct children of a directory, not children of
  // sub-directories.
  async getDirectoryContent(
    dir /*: RemoteDir */,
    { batchSize = 3000 } /*: { batchSize?: number } */ = {}
  ) /*: Promise<$ReadOnlyArray<FullRemoteFile|RemoteDir>> */ {
    const client = await this.getClient()

    const queryDef = Q(FILES_DOCTYPE)
      .where({
        dir_id: dir._id,
        name: { $gt: null }
      })
      .indexFields(['dir_id', 'name'])
      .sortBy([{ dir_id: 'asc' }, { name: 'asc' }])
      .limitBy(batchSize)

    const data = await client.queryAll(queryDef)

    const remoteDocs = []
    for (const j of data) {
      const remoteJson = jsonApiToRemoteJsonDoc(j)
      if (remoteJson._deleted) continue

      const remoteDoc = await this.toRemoteDoc(
        remoteJsonToRemoteDoc(remoteJson),
        dir
      )

      if (!this.isExcludedDirectory(remoteDoc)) {
        remoteDocs.push(remoteDoc)
      }
    }
    return remoteDocs
  }

  isExcludedDirectory(doc /*: FullRemoteFile|RemoteDir */) /*: boolean */ {
    const {
      client: { clientID }
    } = this.config
    return (
      doc.type === DIR_TYPE &&
      doc.not_synchronized_on != null &&
      doc.not_synchronized_on.find(({ id }) => id === clientID) != null
    )
  }

  async isEmpty(id /*: string */) /*: Promise<boolean> */ {
    const dir = await this.findDir(id)
    return dir.relations('contents').length === 0
  }

  async downloadBinary(id /*: string */) /*: Promise<Readable> */ {
    const client = await this.getClient()

    const resp = await client.collection(FILES_DOCTYPE).fetchFileContentById(id)

    return resp.body
  }

  async toRemoteDoc(
    remoteDoc /*: RemoteFile|RemoteDir */,
    parentDir /*: ?RemoteDir */
  ) /*: Promise<FullRemoteFile|RemoteDir> */ {
    if (remoteDoc.type === FILE_TYPE) {
      parentDir = parentDir || (await this.findDir(remoteDoc.dir_id))
      return (this._withPath(remoteDoc, parentDir) /*: FullRemoteFile */)
    }
    return (remoteDoc /*: RemoteDir */)
  }

  /** Set the path of a remote file doc. */
  _withPath(
    doc /*: RemoteFile */,
    parentDir /*: RemoteDir */
  ) /*: FullRemoteFile */ {
    return {
      ...doc,
      path: path.posix.join(parentDir.path, doc.name)
    }
  }

  async warnings() /*: Promise<Warning[]> */ {
    const client = await this.getClient()
    try {
      const response = await client
        .collection(SETTINGS_DOCTYPE)
        .get(`${SETTINGS_DOCTYPE}.warnings`)
      log.warn('Unexpected warnings response. Assuming no warnings.', {
        response
      })
      return []
    } catch (err) {
      const { message, status } = err
      log.debug('remote warnings', { status })
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
    const client = await this.getClient()
    const {
      data: {
        attributes: { flat_subdomains: flatSubdomains }
      }
    } = await client
      .collection(SETTINGS_DOCTYPE)
      .get(`${SETTINGS_DOCTYPE}.capabilities`)
    return { flatSubdomains }
  }

  async addReferencedBy(
    _id /*: string */,
    referencedBy /*: Reference[] */
  ) /*: Promise<{_rev: string, referencedBy: Reference[] }> */ {
    const client = await this.getClient()
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

  async includeInSync(dir /*: RemoteDir */) /*: Promise<void> */ {
    const client = await this.getClient()
    const files = client.collection(FILES_DOCTYPE)
    const {
      client: { clientID }
    } = this.config
    const oauthClient = { _id: clientID, _type: OAUTH_CLIENTS_DOCTYPE }
    await files.removeNotSynchronizedDirectories(oauthClient, [dir])
  }

  async flags() /*: Promise<Object> */ {
    try {
      const client = await this.getClient()
      // Fetch flags from the remote Cozy and store them in the local `cozyFlags`
      // store.
      await cozyFlags.initialize(client)

      // Build a map of flags with their current value
      const flags = {}
      for (const flag of cozyFlags.list()) {
        flags[flag] = cozyFlags(flag)
      }

      return flags
    } catch (err) {
      log.error('could not fetch remote flags', { err })
      return {}
    }
  }

  async fetchOldFileVersions(
    file /*: MetadataRemoteFile|FullRemoteFile */
  ) /*: Promise<RemoteFileVersion[]> */ {
    const client = await this.getClient()

    const { data: remoteDoc, included } = await client
      .collection(FILES_DOCTYPE)
      .statById(file._id)

    if (remoteDoc.type === FILE_TYPE && Array.isArray(included)) {
      const oldVersions = included.filter(
        ({ type }) => type === VERSIONS_DOCTYPE
      )
      return oldVersions
        .map(jsonFileVersionToRemoteFileVersion)
        .sort(sortBy({ updated_at: 'desc' }, { numeric: true }))
    } else {
      return []
    }
  }
}

async function fetchChangesFromFeed(
  since /*: string */,
  client /*: CozyClient */,
  batchSize /*: number */,
  remoteDocs /*: $ReadOnlyArray<CouchDBDoc|CouchDBDeletion> */ = []
) /*: Promise<{ last_seq: string, remoteDocs: $ReadOnlyArray<CouchDBDoc|CouchDBDeletion> }> */ {
  const { newLastSeq: last_seq, pending, results } = await client
    .collection(FILES_DOCTYPE)
    .fetchChanges(
      { since, includeDocs: true, limit: batchSize },
      { includeFilePath: true }
    )
  remoteDocs = remoteDocs.concat(
    results.map(r => (r.doc._deleted ? r.doc : withDefaultValues(r.doc)))
  )

  if (pending === 0) {
    return { last_seq, remoteDocs }
  } else {
    return fetchChangesFromFeed(last_seq, client, batchSize, remoteDocs)
  }
}

async function fetchInitialChanges(
  since /*: string */,
  client /*: CozyClient */,
  batchSize /*: number */,
  remoteDocs /*: CouchDBDoc[] */ = []
) /*: Promise<{ last_seq: string, remoteDocs: CouchDBDoc[] }> */ {
  const { newLastSeq: last_seq, pending, results } = await client
    .collection(FILES_DOCTYPE)
    .fetchChanges(
      { since, includeDocs: true, limit: batchSize },
      { includeFilePath: true, skipDeleted: true, skipTrashed: true }
    )
  remoteDocs = remoteDocs.concat(results.map(r => withDefaultValues(r.doc)))

  if (pending === 0) {
    return { last_seq, remoteDocs }
  } else {
    return fetchInitialChanges(last_seq, client, batchSize, remoteDocs)
  }
}

function sortByPath /*::<T: $ReadOnlyArray<CouchDBDoc|CouchDBDeletion>> */(
  docs /*: T */
) /*: T */ {
  // XXX: We copy the array because `Array.sort()` mutates it and we're supposed
  // to deal with read-only arrays (because it's an array of union type values
  // and Flow will complain if a value can change type).
  return [...docs].sort(byPath)
}

function byPath(
  docA /*: CouchDBDoc|CouchDBDeletion */,
  docB /*: CouchDBDoc|CouchDBDeletion */
) {
  if (!docA._deleted && !docB._deleted) {
    if (docA.path < docB.path) return -1
    if (docA.path > docB.path) return 1
  } else if (docA._deleted && !docB._deleted) {
    return -1
  } else if (docB._deleted && !docA._deleted) {
    return 1
  }
  return 0
}

module.exports = {
  FetchError,
  RemoteCozy
}
