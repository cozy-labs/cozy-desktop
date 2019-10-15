/**
 * @module core/remote/watcher
 * @flow
 */

const _ = require('lodash')

const remoteChange = require('../change')

const sideName = 'remote'

/*::
import type { Metadata } from '../../metadata'
import type { RemoteChange, RemoteFileMove, RemoteDirMove, RemoteDescendantChange } from '../change'
*/

const squashMoves = (
  doc /*: Metadata */,
  was /*: Metadata */,
  previousChanges /*: RemoteChange[] */,
  originalMoves /*: RemoteDirMove[] */
) /*: RemoteDirMove|RemoteFileMove|RemoteDescendantChange */ => {
  let change
  if (doc.docType === 'file') {
    change = {
      sideName,
      type: 'FileMove',
      update: was.md5sum !== doc.md5sum, // move + change
      doc,
      was
    }
  } else {
    change = {
      sideName,
      type: 'DirMove',
      doc,
      was
    }
  }

  const originalParent = originalMoves.find(move =>
    remoteChange.isChildMove(move, change)
  )

  for (const previousChange of previousChanges) {
    if (
      previousChange.type === 'FileTrashing' &&
      change.type === 'FileMove' &&
      previousChange.was.path === change.doc.path
    ) {
      _.assign(previousChange, {
        type: 'IgnoredChange',
        detail: `File ${previousChange.was.path} overwritten by ${
          change.was.path
        }`
      })
      change.doc.overwrite = previousChange.was
      return change
    }

    if (
      previousChange.type === 'DirTrashing' &&
      change.type === 'DirMove' &&
      previousChange.was.path === change.doc.path
    ) {
      _.assign(previousChange, {
        type: 'IgnoredChange',
        detail: `Folder ${previousChange.was.path} overwritten by ${
          change.was.path
        }`
      })
      change.doc.overwrite = previousChange.was
      return change
    }

    if (
      previousChange.type === 'DirMove' &&
      remoteChange.isChildMove(previousChange, change)
    ) {
      if (change.type === 'DirMove') originalMoves.push(_.cloneDeep(change))

      if (remoteChange.isOnlyChildMove(previousChange, change)) {
        const descendantChange /*: RemoteDescendantChange */ = {
          sideName,
          type: 'DescendantChange',
          doc,
          was,
          ancestorPath: _.get(previousChange, 'doc.path')
        }
        if (change.type === 'FileMove') descendantChange.update = change.update
        remoteChange.includeDescendant(previousChange, descendantChange)
        return descendantChange
      } else {
        remoteChange.applyMoveInsideMove(previousChange, change)
        return change
      }
    }

    if (
      change.type === 'DirMove' &&
      (previousChange.type === 'DirMove' ||
        previousChange.type === 'FileMove') &&
      remoteChange.isChildMove(change, previousChange)
    ) {
      if (previousChange.type === 'DirMove')
        originalMoves.push(_.cloneDeep(previousChange))

      if (remoteChange.isOnlyChildMove(change, previousChange)) {
        _.assign(previousChange, {
          type: 'DescendantChange',
          ancestorPath: change.doc.path
        })
        // $FlowFixMe
        remoteChange.includeDescendant(change, previousChange)
      } else {
        remoteChange.applyMoveInsideMove(change, previousChange)
      }
    }

    if (originalParent) {
      if (change.type === 'DirMove') originalMoves.push(_.cloneDeep(change))

      if (remoteChange.isOnlyChildMove(originalParent, change)) {
        const descendantChange /*: RemoteDescendantChange */ = {
          sideName,
          type: 'DescendantChange',
          doc,
          was,
          ancestorPath: _.get(previousChange, 'doc.path')
        }
        if (change.type === 'FileMove') descendantChange.update = change.update
        remoteChange.includeDescendant(originalParent, descendantChange)
        return descendantChange
      } else {
        remoteChange.applyMoveInsideMove(originalParent, change)
        return change
      }
    }
  }

  return change
}

module.exports = squashMoves
