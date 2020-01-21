/**
 * @module core/remote/cozy
 * @flow
 */

const autoBind = require('auto-bind')
const OldCozyClient = require('cozy-client-js').Client
const CozyClient = require('cozy-client').default
const _ = require('lodash')
const path = require('path')

const { FILES_DOCTYPE, FILE_TYPE } = require('./constants')
const {
  dropSpecialDocs,
  jsonApiToRemoteDoc,
  keepFiles,
  parentDirIds
} = require('./document')
const logger = require('../utils/logger')
const userActionRequired = require('./user_action_required')

const { posix } = path

/*::
import type EventEmitter from 'events'
import type { Config } from '../config'
import type { Logger } from '../utils/logger'
import type { Readable } from 'stream'
import type { RemoteDoc, RemoteDeletion } from './document'
import type { Warning } from './warning'
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

const COZY_CLIENT_REVOKED_ERROR = 'CozyClientRevokedError'
const COZY_CLIENT_REVOKED_MESSAGE = 'Client has been revoked' // Only necessary for the GUI
class CozyClientRevokedError extends Error {
  constructor() {
    super(COZY_CLIENT_REVOKED_MESSAGE)

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CozyClientRevokedError)
    }

    this.name = COZY_CLIENT_REVOKED_ERROR
  }
}

/*::
import type FetchError from 'electron-fetch'
import type { RemoteChange } from './change'
import type { MetadataChange } from '../sync'

type CommonCozyErrorHandlingOptions = {
  events: EventEmitter,
  log: Logger
}

type CommonCozyErrorHandlingResult =
  | 'offline'

// See definition at https://github.com/cozy/cozy-client-js/blob/v0.13.0/src/fetch.js#L152
type CozyFetchError = Error & {
  name: 'FetchError',
  response: *,
  url: string,
  status: number,
  reason: { message: string } | string,
  message: string
}
*/

const handleCommonCozyErrors = (
  {
    err,
    change
  } /*: { err: FetchError | CozyFetchError | Error, change?: RemoteChange | MetadataChange } */,
  { events, log } /*: CommonCozyErrorHandlingOptions */
) /*: CommonCozyErrorHandlingResult */ => {
  if (err.name === 'FetchError') {
    if (err.status === 400) {
      log.error({ err, change })
      throw new CozyClientRevokedError()
    } else if (err.status === 402) {
      log.error({ err, change }, 'User action required')
      throw userActionRequired.includeJSONintoError(err)
    } else if (err.status === 403) {
      log.error(
        { err, change },
        'Client has wrong permissions (lack disk-usage)'
      )
      throw new Error('Client has wrong permissions (lack disk-usage)')
    } else {
      log.warn({ err, change }, 'Assuming offline')
      events.emit('offline')
      return 'offline'
    }
  } else {
    log.error({ err, change })
    throw err
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

  updateLastSync() /*: Promise<void> */ {
    return this.client.settings.updateLastSync()
  }

  createFile(
    data /*: Readable */,
    options /*: {name: string,
                          dirID?: ?string,
                          contentType?: ?string,
                          lastModifiedDate?: ?Date} */
  ) /*: Promise<RemoteDoc> */ {
    return this.client.files.create(data, options).then(this.toRemoteDoc)
  }

  createDirectory(
    options /*: {name: string, dirID?: string} */
  ) /*: Promise<RemoteDoc> */ {
    return this.client.files.createDirectory(options).then(this.toRemoteDoc)
  }

  updateFileById(
    id /*: string */,
    data /*: Readable */,
    options /*: {contentType?: ?string,
                               lastModifiedDate?: ?Date} */
  ) /*: Promise<RemoteDoc> */ {
    return this.client.files
      .updateById(id, data, options)
      .then(this.toRemoteDoc)
  }

  updateAttributesById(
    id /*: string */,
    attrs /*: Object */,
    options /*: ?{ifMatch?: string} */
  ) /*: Promise<RemoteDoc> */ {
    return this.client.files
      .updateAttributesById(id, attrs, options)
      .then(this.toRemoteDoc)
  }

  trashById(
    id /*: string */,
    options /*: ?{ifMatch: string} */
  ) /*: Promise<RemoteDoc> */ {
    return this.client.files.trashById(id, options).then(this.toRemoteDoc)
  }

  destroyById(
    id /*: string */,
    options /*: ?{ifMatch: string} */
  ) /*: Promise<void> */ {
    return this.client.files.destroyById(id, options)
  }

  async changes(
    since /*: string */ = '0'
  ) /*: Promise<{last_seq: string, docs: Array<RemoteDoc|RemoteDeletion>}> */ {
    const { last_seq, results } = await getChangesFeed(since, this.client)

    // The stack docs: dirs, files (without a path), deletions
    const rawDocs = dropSpecialDocs(results.map(r => r.doc))

    // The parent dirs for each file, indexed by id
    const fileParentsById = await this.client.data.findMany(
      FILES_DOCTYPE,
      parentDirIds(keepFiles(rawDocs))
    )

    // The final docs with their paths (except for deletions)
    let remoteDocs /*: Array<RemoteDoc|RemoteDeletion> */ = []

    for (const remoteDoc of rawDocs) {
      if (remoteDoc.type === FILE_TYPE) {
        // File docs returned by the cozy-stack don't have a path
        const parent = fileParentsById[remoteDoc.dir_id]

        if (parent.error || parent.doc == null || parent.doc.path == null) {
          log.error(
            { remoteDoc, parent },
            'Could not compute doc path from parent'
          )
          continue
        } else {
          remoteDoc.path = path.posix.join(parent.doc.path, remoteDoc.name)
        }
      }
      remoteDocs.push(remoteDoc)
    }

    return { last_seq, docs: remoteDocs }
  }

  async find(id /*: string */) /*: Promise<RemoteDoc> */ {
    return this.toRemoteDoc(await this.client.files.statById(id))
  }

  async findMaybe(id /*: string */) /*: Promise<?RemoteDoc> */ {
    try {
      return await this.find(id)
    } catch (err) {
      return null
    }
  }

  async findDirectoryByPath(path /*: string */) /*: Promise<RemoteDoc> */ {
    const index = await this.client.data.defineIndex(FILES_DOCTYPE, ['path'])
    const results = await this.client.data.query(index, { selector: { path } })

    if (results.length === 0) throw new DirectoryNotFound(path, this.url)

    // FIXME: cozy-client-js query results have no _type
    return _.merge({ _type: FILES_DOCTYPE }, results[0])
  }

  // FIXME: created_at is returned by some methods, but not all of them

  async findOrCreateDirectoryByPath(
    path /*: string */
  ) /*: Promise<RemoteDoc> */ {
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

      log.info({ path, name, dirID }, 'Creating directory...')
      return this.createDirectory({ name, dirID })
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

  async toRemoteDoc(doc /*: any */) /*: Promise<RemoteDoc> */ {
    if (doc.attributes) doc = jsonApiToRemoteDoc(doc)
    if (doc.type === FILE_TYPE) await this._setPath(doc)
    return doc
  }

  /** Retrieve the path of a remote file doc. */
  async _setPath(doc /*: * */) /*: Promise<*> */ {
    const parentDir = await this.find(doc.dir_id)
    doc.path = path.posix.join(parentDir.path, doc.name)
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
    const client = await CozyClient.fromOldOAuthClient(this.client)
    const {
      data: {
        attributes: { flat_subdomains: flatSubdomains }
      }
    } = await client.query(client.get('io.cozy.settings', 'capabilities'))
    return { flatSubdomains }
  }
}

module.exports = {
  DirectoryNotFound,
  COZY_CLIENT_REVOKED_ERROR,
  COZY_CLIENT_REVOKED_MESSAGE,
  CozyClientRevokedError,
  handleCommonCozyErrors,
  RemoteCozy
}

async function getChangesFeed(
  since /*: string */,
  client /*: OldCozyClient */
) /*: Promise<{pending: number, last_seq: string, results: Array<any> }> */ {
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
  return Object.assign({}, nextResponse, {
    results: [...results, ...nextResponse.results]
  })
}
