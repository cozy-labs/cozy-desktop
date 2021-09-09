/**
 * @module core/remote/cozy
 * @flow
 */

const autoBind = require('auto-bind')
const OldCozyClient = require('cozy-client-js').Client
const CozyClient = require('cozy-client').default
const { FetchError } = require('cozy-stack-client')
const { Q } = require('cozy-client')
const path = require('path')
const addSecretEventListener = require('secret-event-listener')

const {
  FILES_DOCTYPE,
  FILE_TYPE,
  DIR_TYPE,
  MAX_FILE_SIZE,
  OAUTH_CLIENTS_DOCTYPE
} = require('./constants')
const { DirectoryNotFound } = require('./errors')
const {
  dropSpecialDocs,
  remoteJsonToRemoteDoc,
  jsonApiToRemoteJsonDoc,
  keepFiles,
  parentDirIds
} = require('./document')
const logger = require('../utils/logger')

/*::
import type { Config } from '../config'
import type { Readable } from 'stream'
import type {
  RemoteJsonDoc,
  RemoteJsonFile,
  RemoteJsonDir,
  RemoteDoc,
  RemoteFile,
  RemoteDir,
  RemoteDeletion,
} from './document'
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

type ChangesFeedResponse = {|
  last_seq: string,
  remoteDocs: Array<RemoteDoc|RemoteDeletion>
|}
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
  */

  constructor(config /*: Config */) {
    this.config = config
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
  async _withDomainErrors /*:: <T: MetadataRemoteInfo> */(
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

      return await fn()
    } catch (err) {
      if (/mojo result/.test(err.message)) {
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
  ) /*: Promise<MetadataRemoteFile> */ {
    return this._withDomainErrors(data, options, async () => {
      const file /* RemoteJsonFile*/ = await this.client.files.create(data, {
        ...options,
        noSanitize: true
      })
      return this.toRemoteDoc(file)
    })
  }

  async createDirectory(
    options /*: {|name: string,
                 dirID?: string,
                 createdAt: string,
                 updatedAt: string|} */
  ) /*: Promise<MetadataRemoteDir> */ {
    const folder /*: RemoteJsonDir */ = await this.client.files.createDirectory(
      {
        ...options,
        noSanitize: true
      }
    )
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
  ) /*: Promise<MetadataRemoteFile> */ {
    return this._withDomainErrors(data, options, async () => {
      const updated /*: RemoteJsonFile */ = await this.client.files.updateById(
        id,
        data,
        {
          ...options,
          noSanitize: true
        }
      )
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
    const updated = await this.client.files.updateAttributesById(id, attrs, {
      ...options,
      noSanitize: true
    })
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
    since /*: string */ = '0',
    batchSize /*: number */ = 10000
  ) /*: Promise<{last_seq: string, docs: Array<MetadataRemoteInfo|RemoteDeletion>}> */ {
    const client = await this.newClient()
    const { last_seq, remoteDocs } =
      since === '0'
        ? await fetchInitialChanges(client)
        : await fetchChangesFromFeed(since, this.client, batchSize)

    const docs = await this.completeRemoteDocs(dropSpecialDocs(remoteDocs))

    return { last_seq, docs }
  }

  async completeRemoteDocs(
    rawDocs /*: Array<RemoteDoc|RemoteDeletion> */
  ) /*: Promise<Array<MetadataRemoteInfo|RemoteDeletion>> */ {
    // The final docs with their paths (except for deletions)
    const remoteDocs /*: Array<MetadataRemoteInfo|RemoteDeletion> */ = []

    // The parent dirs for each file, indexed by id
    const fileParentsById = await this.client.data.findMany(
      FILES_DOCTYPE,
      parentDirIds(keepFiles(rawDocs))
    )

    for (const rawDoc of rawDocs) {
      if (rawDoc._deleted) {
        remoteDocs.push(rawDoc)
      } else if (rawDoc.type === FILE_TYPE) {
        const parent = fileParentsById[rawDoc.dir_id]
        if (parent.error || parent.doc == null || parent.doc.path == null) {
          log.error(
            { err: parent.error, rawDoc, parent, sentry: true },
            'Could not compute doc path from parent'
          )
          continue
        } else {
          remoteDocs.push(this._withPath(rawDoc, parent.doc))
        }
      } else {
        remoteDocs.push(rawDoc)
      }
    }

    return remoteDocs
  }

  async find(id /*: string */) /*: Promise<MetadataRemoteInfo> */ {
    return this.toRemoteDoc(await this.client.files.statById(id))
  }

  async findDir(id /*: string */) /*: Promise<MetadataRemoteDir> */ {
    const remoteDir = await this.client.files.statById(id)
    const doc = await this.toRemoteDoc(remoteDir)
    if (doc.type !== DIR_TYPE) {
      throw new Error(`Unexpected file with remote _id ${id}`)
    }
    return doc
  }

  async findMaybe(id /*: string */) /*: Promise<?MetadataRemoteInfo> */ {
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

  async search(selector /*: Object */) /*: Promise<MetadataRemoteInfo[]> */ {
    const index = await this.client.data.defineIndex(
      FILES_DOCTYPE,
      Object.keys(selector)
    )
    const results = await this.client.data.query(index, { selector })
    return Promise.all(
      results.map(async result => {
        if (result.type === FILE_TYPE) {
          const parentDir /*: RemoteDir */ = await this.findDir(result.dir_id)
          return this._withPath(result, parentDir)
        }
        return result
      })
    )
  }

  async findDirectoryByPath(
    path /*: string */
  ) /*: Promise<MetadataRemoteDir> */ {
    const results = await this.search({ path })
    if (results.length === 0 || results[0].type !== 'directory') {
      throw new DirectoryNotFound(path, this.url)
    }

    return results[0]
  }

  async getDirectoryContent(
    dir /*: RemoteDir */,
    { client } /*: { client: ?CozyClient } */ = {}
  ) /*: Promise<$ReadOnlyArray<MetadataRemoteInfo>> */ {
    client = client || (await this.newClient())

    let dirContent = []
    let resp /*: { next: boolean, bookmark?: string, data: Object[] } */ = {
      next: true,
      data: []
    }
    while (resp && resp.next) {
      const queryDef = Q(FILES_DOCTYPE)
        .where({
          dir_id: dir._id
        })
        .indexFields(['name'])
        .sortBy([{ name: 'asc' }])
        .limitBy(10000)
        .offsetBookmark(resp.bookmark)
      resp = await client.query(queryDef)
      for (const j of resp.data) {
        const remoteJson = jsonApiToRemoteJsonDoc(j)
        if (remoteJson._deleted) continue

        const remoteDoc = await this.toRemoteDoc(remoteJson, dir)
        dirContent.push(remoteDoc)
        if (remoteDoc.type === DIR_TYPE) {
          // Fetch subdir content
          dirContent.push(this.getDirectoryContent(remoteDoc, { client }))
        }
      }
    }
    // $FlowFixMe Array.prototype.flat is available in NodeJS v12
    return (await Promise.all(dirContent)).flat()
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

  async toRemoteDoc(
    doc /*: RemoteJsonDoc */,
    parentDir /*: ?RemoteDir */
  ) /*: Promise<*> */ {
    const remoteDoc = remoteJsonToRemoteDoc(doc)
    if (remoteDoc.type === FILE_TYPE) {
      parentDir = parentDir || (await this.findDir(remoteDoc.dir_id))
      return this._withPath(remoteDoc, parentDir)
    }
    return remoteDoc
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
    } = await client.query(Q('io.cozy.settings').getById('capabilities'))
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

  async includeInSync(dir /*: MetadataRemoteDir */) /*: Promise<void> */ {
    const client = await this.newClient()
    const files = client.collection(FILES_DOCTYPE)
    const {
      client: { clientID }
    } = this.config
    const oauthClient = { _id: clientID, _type: OAUTH_CLIENTS_DOCTYPE }
    await files.removeNotSynchronizedDirectories(oauthClient, [dir])
  }
}

async function fetchChangesFromFeed(
  since /*: string */,
  client /*: OldCozyClient */,
  batchSize /*: number */,
  remoteDocs /*: Array<RemoteDoc|RemoteDeletion> */ = []
) /*: Promise<ChangesFeedResponse> */ {
  const { last_seq, pending, results } = await client.data.changesFeed(
    FILES_DOCTYPE,
    {
      since,
      include_docs: true,
      limit: batchSize
    }
  )
  remoteDocs = remoteDocs.concat(results.map(r => r.doc))

  if (pending === 0) {
    return { last_seq, remoteDocs }
  } else {
    return fetchChangesFromFeed(last_seq, client, batchSize, remoteDocs)
  }
}

async function fetchInitialChanges(
  client /*: CozyClient */
) /*: Promise<ChangesFeedResponse> */ {
  const { newLastSeq: last_seq } = await client.stackClient
    .collection(FILES_DOCTYPE)
    .fetchChanges({
      limit: 1,
      descending: true
    })
  const remoteDocs = await client.queryAll(Q(FILES_DOCTYPE))

  return { last_seq, remoteDocs }
}

module.exports = {
  FetchError,
  RemoteCozy
}
