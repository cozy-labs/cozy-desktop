/**
 * @module core/remote/cozyProxy
 * @flow
 */

const _ = require('lodash')

const { INITIAL_SEQ } = require('./constants')
const { dropSpecialDocs, withDefaultValues } = require('./document')
const querystring = require('./querystring')
const { sortByPath, uri } = require('./utils')

/*::
import type { CozyStackClient } from 'cozy-client'

import type { RemoteCozy } from './cozy'
import type { ChangesFeedResponse, ClientWrapper } from './clientWrapper'
import type { CouchDBDeletion, CouchDBDoc, FullRemoteFile, RemoteDir } from './document'

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

    return { last_seq, docs: [], isInitialFetch }
  }

  async getDirectoryContent(
    remoteDir /*: RemoteDir */,
    { batchSize } /*: { batchSize?: number } */ = {}
  ) /*: Promise<$ReadOnlyArray<FullRemoteFile|RemoteDir>> */ {
    return [].slice(batchSize)
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
