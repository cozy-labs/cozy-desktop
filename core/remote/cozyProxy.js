/**
 * @module core/remote/cozyProxy
 * @flow
 */

const { posix: posixPath } = require('path')

const _ = require('lodash')

const {
  DIR_TYPE,
  FILE_TYPE,
  FILES_DOCTYPE,
  INITIAL_SEQ
} = require('./constants')
const {
  dropSpecialDocs,
  jsonApiToRemoteDoc,
  withDefaultValues
} = require('./document')
const querystring = require('./querystring')
const { sortByPath, uri } = require('./utils')

/*::
import type { CozyStackClient } from 'cozy-client'
import type { Readable } from 'stream'

import type { RemoteCozy } from './cozy'
import type { ChangesFeedResponse, ClientWrapper } from './clientWrapper'
import type { CouchDBDeletion, CouchDBDoc, FullRemoteFile, JsonApiDir, JsonApiFile, RemoteDir, RemoteFile } from './document'

type CouchOptions = {
  since?: string,
  limit?: number,
  includeDocs?: boolean,
}

type FetchChangesOptions = {
  fields?: Array<string>,
  includeFilePath?: boolean,
  skipDeleted?: boolean,
  skipTrashed?: boolean,
}

type  FetchChangesReturnValue = {
  newLastSeq: string,
  pending: boolean,
  results: Array<Object>,
}
*/

class CozyProxy /*:: implements ClientWrapper */ {
  /*::
  sharingId: string
  cozy: RemoteCozy
  stackClient: CozyStackClient
  */

  constructor(sharingId /*: string */, { cozy } /*: { cozy: RemoteCozy } */) {
    this.sharingId = sharingId
    this.cozy = cozy
    this.stackClient = cozy.client.stackClient
  }

  async changes(
    since /*: string */ = INITIAL_SEQ,
    batchSize /*: number */ = 3000
  ) /*: ChangesFeedResponse */ {
    const isInitialFetch = since === INITIAL_SEQ
    const { last_seq, remoteDocs } = isInitialFetch
      ? await fetchInitialChanges(this, since, batchSize)
      : await fetchChangesFromFeed(this, since, batchSize)

    const docs = sortByPath(dropSpecialDocs(remoteDocs))

    console.log({
      sharingId: this.sharingId,
      since,
      last_seq,
      isInitialFetch,
      docs
    })

    return { last_seq, docs, isInitialFetch }
  }

  async getDirectoryContent(
    remoteDir /*: RemoteDir */,
    { batchSize } /*: { batchSize?: number } */ = {}
  ) /*: Promise<$ReadOnlyArray<FullRemoteFile|RemoteDir>> */ {
    return [].slice(batchSize)
  }

  async downloadBinary(id /*: string */) /*: Promise<Readable> */ {
    const resp = await this.cozy.client
      .collection(FILES_DOCTYPE, { driveId: this.sharingId })
      .fetchFileContentById(id)

    return resp.body
  }

  async find(id /*: string */) /*: Promise<FullRemoteFile|RemoteDir> */ {
    const { data: doc } = await this.cozy.client
      .collection(FILES_DOCTYPE)
      .statById(id)
    return this.toRemoteDoc(doc)
  }

  async findDir(id /*: string */) /*: Promise<RemoteDir> */ {
    const doc = await this.find(id)
    if (doc.type !== DIR_TYPE) {
      if (doc.drive) {
        const err = new Error('Cannot fetch drive shortcut as directory')
        // $FlowFixMe adding status attribute on purpose (see findDirMaybe)
        err.status = 404
        throw err
      }

      throw new Error(`Unexpected file with remote _id ${id}`)
    }
    return doc
  }

  async findByPath(
    path /*: string */
  ) /*: Promise<FullRemoteFile|RemoteDir> */ {
    const { data } = await this.cozy.client
      .collection(FILES_DOCTYPE, { driveId: this.sharingId })
      .statByPath(path)
    return this.toRemoteDoc(data)
  }

  async findMaybeByPath(
    path /*: string */
  ) /*: Promise<?FullRemoteFile|RemoteDir> */ {
    try {
      return await this.findByPath(path)
    } catch (err) {
      if (err.status === 404) return null
      else throw err
    }
  }

  async toRemoteDoc(
    doc /*: JsonApiFile|JsonApiDir */,
    parentDir /*: ?RemoteDir */
  ) /*: Promise<FullRemoteFile|RemoteDir> */ {
    const remoteDoc = jsonApiToRemoteDoc(doc)
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
      path: posixPath.join(parentDir.path, doc.name)
    }
  }

  async isSharedDriveShortcut(/*:: remoteDoc: CouchDBDoc|CouchDBDeletion|FullRemoteFile|RemoteDir */) /*: Promise<boolean> */ {
    return false
  }
}

async function fetchChangesFromFeed(
  {
    stackClient,
    sharingId
  } /*: { stackClient: CozyStackClient, sharingId: string } */,
  since /*: string */,
  batchSize /*: number */,
  remoteDocs /*: $ReadOnlyArray<CouchDBDoc|CouchDBDeletion> */ = []
) /*: Promise<{ last_seq: string, remoteDocs: $ReadOnlyArray<CouchDBDoc|CouchDBDeletion> }> */ {
  const { newLastSeq: last_seq, pending, results } = await fetchChanges(
    { stackClient, sharingId },
    { since, includeDocs: true, limit: batchSize },
    { includeFilePath: true }
  )
  remoteDocs = remoteDocs.concat(
    results.map(r => (r.doc._deleted ? r.doc : withDefaultValues(r.doc)))
  )

  if (pending === 0) {
    return { last_seq, remoteDocs }
  } else {
    return fetchChangesFromFeed(
      { stackClient, sharingId },
      last_seq,
      batchSize,
      remoteDocs
    )
  }
}

async function fetchInitialChanges(
  {
    stackClient,
    sharingId
  } /*: { stackClient: CozyStackClient, sharingId: string } */,
  since /*: string */,
  batchSize /*: number */,
  remoteDocs /*: CouchDBDoc[] */ = []
) /*: Promise<{ last_seq: string, remoteDocs: CouchDBDoc[] }> */ {
  const { newLastSeq: last_seq, pending, results } = await fetchChanges(
    { stackClient, sharingId },
    { since, includeDocs: true, limit: batchSize },
    { includeFilePath: true, skipDeleted: true, skipTrashed: true }
  )
  remoteDocs = remoteDocs.concat(results.map(r => withDefaultValues(r.doc)))

  if (pending === 0) {
    return { last_seq, remoteDocs }
  } else {
    return fetchInitialChanges(
      { stackClient, sharingId },
      last_seq,
      batchSize,
      remoteDocs
    )
  }
}

async function fetchChanges(
  {
    stackClient,
    sharingId
  } /*: { stackClient: CozyStackClient, sharingId: string } */,
  couchOptions /*: CouchOptions */ = {},
  options /*: FetchChangesOptions */ = {}
) /*: Promise<FetchChangesReturnValue> */ {
  let opts = {}
  if (typeof couchOptions !== 'object') {
    opts.since = couchOptions
  } else if (Object.keys(couchOptions).length > 0) {
    Object.assign(opts, couchOptions)
  }
  if (Object.keys(options).length > 0) {
    Object.assign(opts, options)

    if (options.skipTrashed || options.includeFilePath) {
      opts.includeDocs = true
    }
  }

  const params = {
    ..._.omit(opts, [
      'fields',
      'includeDocs',
      'includeFilePath',
      'skipDeleted',
      'skipTrashed'
    ]),
    fields: opts.fields ? opts.fields.join(',') : null,
    include_docs: opts.includeDocs,
    include_file_path: opts.includeFilePath,
    skip_deleted: opts.skipDeleted,
    skip_trashed: opts.skipTrashed
  }
  const path = uri`/sharings/drives/${sharingId}/_changes`
  const url = querystring.buildURL(path, params)
  const {
    last_seq: newLastSeq,
    pending,
    results
  } = await stackClient.fetchJSON('GET', url)

  return { newLastSeq, pending, results }
}

module.exports = {
  CozyProxy
}
