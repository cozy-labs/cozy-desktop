/* @flow */

/** An identity conflict is a conflict where two files/dirs can coexist on the
 * remote side but not on the local one because they would be considered the
 * same by the file system.
 *
 * In case a remote doc was already merged and some just added local doc has an
 * identity that conflicts with the former (race condition), renaming the local
 * doc would still prevent the remote one from being written locally.
 *
 * This is why identity conflicts are always resolved on the remote side.
 */

const _ = require('lodash')

/*::
import type { Metadata, SideName } from './metadata'

type Change = {
  side: SideName,
  doc: Metadata,
  was?: Metadata
}
// TODO: Pass Change objects to Merge methods too.

export opaque type IdConflictInfo = {
  change: Change,
  existingDoc: Metadata,
  platform: string
}
*/

module.exports = {
  description,
  detect,
  detectOnId,
  existsBetween
}

const { platform } = process

/** Human readable description of the conflict */
function description ({ change, existingDoc, platform } /*: IdConflictInfo */) /*: string */ {
  const newPathRepr = JSON.stringify(change.doc.path)
  const existingPathRepr = JSON.stringify(existingDoc.path)
  const idRepr = JSON.stringify(existingDoc._id)
  return (
    `Identity conflict between new ${change.side} ${change.doc.docType} ${newPathRepr} ` +
    `and existing ${existingDoc.docType} ${existingPathRepr}: ` +
    `both would get the same ${idRepr} id on ${platform}.`
  )
}

/** Return IdConflictInfo in case `change.doc` and `existingDoc` cannot coexist
 * on the current platform.
 */
function detect (change /*: Change */, existingDoc /*: ?Metadata */) /*: ?IdConflictInfo */ {
  if (existingDoc && existsBetween(change, existingDoc)) {
    return {
      change,
      existingDoc,
      platform
    }
  }
}

function detectOnId ({doc, was} /*: $Diff<Change, {side: SideName}> */, existingDoc /*: Metadata */) /*: boolean */ {
  return (
    doc._id === existingDoc._id &&
    doc.path !== existingDoc.path &&
    (
      was == null ||
      was.path !== existingDoc.path
    )
  )
}

function detectOnRemote ({doc, was} /*: $Diff<Change, {side: SideName}> */, existingDoc /*: Metadata */) /*: boolean */ {
  return _.get(doc, 'remote._id') !== _.get(existingDoc, 'remote._id')
}

/** Does an identity conflict exist between a change and an existing doc?
 *
 * The side is not used here, hence the $Diff flow type annotation.
 */
function existsBetween (change /*: $Diff<Change, {side: SideName}> */, existingDoc /*: Metadata */) /*: boolean */ {
  return (
    detectOnId(change, existingDoc) &&
    detectOnRemote(change, existingDoc)
  )
}
