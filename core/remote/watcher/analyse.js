/**
 * @module core/remote/watcher/analyse
 * @flow
 */

const _ = require('lodash')

const metadata = require('../../metadata')
const remoteChange = require('../change')
const squashMoves = require('./squashMoves')
const { inRemoteTrash } = require('../document')
const logger = require('../../utils/logger')

const log = logger({
  component: 'RemoteWatcher'
})

const sideName = 'remote'

/*::
import type { Metadata } from '../../metadata'
import type { RemoteChange, RemoteDirMove, RemoteDescendantChange } from '../change'
import type { RemoteDoc, RemoteDeletion } from '../document'
*/

module.exports = analyse

function analyse(
  remoteDocs /*: Array<RemoteDoc|RemoteDeletion> */,
  olds /*: Array<Metadata> */
) /*: Array<RemoteChange> */ {
  const changes /*: Array<RemoteChange> */ = []
  const originalMoves = []

  const oldsByRemoteId = _.keyBy(olds, 'remote._id')
  for (const remoteDoc of remoteDocs) {
    const was /*: ?Metadata */ = oldsByRemoteId[remoteDoc._id]
    changes.push(identifyChange(remoteDoc, was, changes, originalMoves))
  }

  log.trace('Done with analysis.')
  return changes
}

function identifyChange(
  remoteDoc /*: RemoteDoc|RemoteDeletion */,
  was /*: ?Metadata */,
  previousChanges /*: Array<RemoteChange> */,
  originalMoves /*: Array<RemoteDirMove|RemoteDescendantChange> */
) /*: RemoteChange */ {
  const oldpath /*: ?string */ = was && was.path
  log.debug(
    {
      path: (remoteDoc /*: Object */).path || oldpath,
      oldpath,
      remoteDoc,
      was
    },
    'change received'
  )

  if (remoteDoc._deleted) {
    if (was == null) {
      return {
        sideName,
        type: 'IgnoredChange',
        doc: remoteDoc,
        detail: 'file or directory was created, trashed, and removed remotely'
      }
    }
    // $FlowFixMe
    return remoteChange.deleted(was)
  } else {
    if (remoteDoc.type !== 'directory' && remoteDoc.type !== 'file') {
      return {
        sideName,
        type: 'InvalidChange',
        doc: remoteDoc,
        error: new Error(
          `Document ${remoteDoc._id} is not a file or a directory`
        )
      }
    } else if (
      remoteDoc.type === 'file' &&
      (remoteDoc.md5sum == null || remoteDoc.md5sum === '')
    ) {
      return {
        sideName,
        type: 'IgnoredChange',
        doc: remoteDoc,
        detail: 'Ignoring temporary file'
      }
    } else {
      return identifyExistingDocChange(
        remoteDoc,
        was,
        previousChanges,
        originalMoves
      )
    }
  }
}

/**
 * FIXME: comment: Transform the doc and save it in pouchdb
 *
 * In both CouchDB and PouchDB, the filepath includes the name field.
 * And the _id/_rev from CouchDB are saved in the remote field in PouchDB.
 *
 * Note that the changes feed can aggregate several changes for many changes
 * for the same document. For example, if a file is created and then put in
 * the trash just after, it looks like it appeared directly on the trash.
 */
function identifyExistingDocChange(
  remoteDoc /*: RemoteDoc */,
  was /*: ?Metadata */,
  previousChanges /*: Array<RemoteChange> */,
  originalMoves /*: Array<RemoteDirMove|RemoteDescendantChange> */
) /*: RemoteChange */ {
  let doc /*: Metadata */ = metadata.fromRemoteDoc(remoteDoc)
  try {
    metadata.ensureValidPath(doc)
  } catch (error) {
    return {
      sideName,
      type: 'InvalidChange',
      doc,
      error
    }
  }
  metadata.assignId(doc)

  if (doc.docType !== 'file' && doc.docType !== 'folder') {
    return {
      sideName,
      type: 'InvalidChange',
      doc,
      error: new Error(`Unexpected docType: ${doc.docType}`)
    }
  }

  if (
    was &&
    was.remote &&
    metadata.extractRevNumber(was.remote) >=
      metadata.extractRevNumber(doc.remote)
  ) {
    return remoteChange.upToDate(doc, was)
  }

  if (inRemoteTrash(remoteDoc)) {
    if (!was) {
      return {
        sideName,
        type: 'IgnoredChange',
        doc,
        detail: `${doc.docType} was created and trashed remotely`
      }
    }
    const previousMoveToSamePath = _.find(
      previousChanges,
      change =>
        (change.type === 'DescendantChange' ||
          change.type === 'FileMove' ||
          change.type === 'DirMove') &&
        // $FlowFixMe
        change.doc.path === was.path
    )

    if (previousMoveToSamePath) {
      previousMoveToSamePath.doc.overwrite = was
      return {
        sideName,
        type: 'IgnoredChange',
        doc,
        was,
        detail: `${was.docType} ${was.path} overwritten by ${previousMoveToSamePath.was.path}`
      }
    }
    return remoteChange.trashed(doc, was)
  }
  if (!was) {
    return remoteChange.added(doc)
  }
  if (!inRemoteTrash(remoteDoc) && was.trashed) {
    return remoteChange.restored(doc, was)
  }
  if (was._id === doc._id && was.path === doc.path) {
    if (
      doc.docType === 'file' &&
      doc.md5sum === was.md5sum &&
      doc.size !== was.size
    ) {
      return {
        sideName,
        type: 'InvalidChange',
        doc,
        was,
        error: new Error(
          'File is corrupt on either side (md5sum matches but size does not)'
        )
      }
    } else {
      return remoteChange.updated(doc)
    }
  }
  // It's a move
  return squashMoves(doc, was, previousChanges, originalMoves)
}
