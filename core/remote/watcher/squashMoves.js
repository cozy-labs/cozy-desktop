/**
 * @module core/remote/watcher
 * @flow
 */

const _ = require('lodash')
const path = require('path')

const metadata = require('../../metadata')
const remoteChange = require('../change')

const sideName = 'remote'

/*::
import type { Metadata, Saved, SavedMetadata } from '../../metadata'
import type {
  RemoteChange,
  RemoteFileMove,
  RemoteDirMove,
  RemoteDescendantDirMove,
  RemoteDescendantFileMove
} from '../change'
*/

const buildChange = (sideName, doc, was) => {
  if (doc.docType === 'file' && was.docType === 'file') {
    return {
      sideName,
      type: 'FileMove',
      update: was.md5sum !== doc.md5sum, // move + change
      doc,
      was
    }
  } else if (doc.docType === 'folder' && was.docType === 'folder') {
    return {
      sideName,
      type: 'DirMove',
      doc,
      was,
      descendantMoves: []
    }
  }
}

const findParentMoves = (
  change /*: RemoteChange */,
  previousChanges /*: RemoteChange[] */,
  encounteredMoves /*: Array<RemoteDirMove|RemoteDescendantDirMove> */
) => {
  const parentMove /*: ?RemoteDirMove|RemoteDescendantDirMove */ =
    encounteredMoves.find(move => remoteChange.isChildMove(move, change))
  let squashedParentMove /*: ?RemoteDirMove|RemoteDescendantDirMove */
  if (parentMove) {
    for (const previousChange of previousChanges) {
      if (
        (previousChange.type === 'DirMove' ||
          previousChange.type === 'DescendantDirMove') &&
        metadata.id(previousChange.doc.path) ===
          metadata.id(parentMove.doc.path)
      ) {
        squashedParentMove = previousChange
        break
      }
    }
  } else {
    for (const previousChange of previousChanges) {
      if (
        (previousChange.type === 'DirMove' ||
          previousChange.type === 'DescendantDirMove') &&
        remoteChange.isChildMove(previousChange, change)
      )
        squashedParentMove = previousChange
      break
    }
  }

  return { parentMove, squashedParentMove }
}

const findChildrenMoves = (
  change /*: RemoteDirMove|RemoteDescendantDirMove */,
  originalChange /*: ?RemoteDirMove|RemoteDescendantDirMove */,
  previousChanges /*: RemoteChange[] */
) /*: Array<RemoteFileMove|RemoteDirMove> */ => {
  const childrenMoves = []
  for (const previousChange of previousChanges) {
    if (
      (previousChange.type === 'FileMove' ||
        previousChange.type === 'DirMove') &&
      (remoteChange.isChildMove(change, previousChange) ||
        (originalChange &&
          remoteChange.isChildMove(originalChange, previousChange)))
    )
      childrenMoves.push(previousChange)
  }
  return childrenMoves
}

const buildDescendantChange = (
  child /*: RemoteDirMove|RemoteDescendantDirMove|RemoteDescendantFileMove|RemoteFileMove */,
  parent /*: RemoteDirMove|RemoteDescendantDirMove */
) /*: RemoteDescendantDirMove|RemoteDescendantFileMove */ => {
  if (child.type === 'DirMove' || child.type === 'DescendantDirMove') {
    return {
      sideName,
      type: 'DescendantDirMove',
      doc: _.clone(child.doc),
      was: _.clone(child.was),
      ancestor: parent,
      descendantMoves: child.descendantMoves
    }
  } else {
    return {
      sideName,
      type: 'DescendantFileMove',
      doc: _.clone(child.doc),
      was: _.clone(child.was),
      ancestor: parent,
      update: _.clone(child.update)
    }
  }
}

const buildMoveInsideMove = (
  child /*: RemoteFileMove|RemoteDirMove */,
  parent /*: RemoteDirMove|RemoteDescendantDirMove */
) /*: RemoteFileMove|RemoteDirMove */ => {
  const correctedSrc /*: SavedMetadata */ = _.clone(child.was)
  correctedSrc.path = path.join(parent.doc.path, path.basename(child.was.path))

  if (child.type === 'FileMove') {
    return {
      sideName,
      type: 'FileMove',
      doc: _.clone(child.doc),
      was: correctedSrc,
      needRefetch: true
    }
  } else {
    return {
      sideName,
      type: 'DirMove',
      doc: _.clone(child.doc),
      was: correctedSrc,
      needRefetch: true,
      descendantMoves: child.descendantMoves
    }
  }
}

const squashedWithParent = (
  change /*: RemoteDirMove|RemoteFileMove */,
  previousChanges /*: RemoteChange[] */,
  encounteredMoves /*: Array<RemoteDirMove|RemoteDescendantDirMove> */
) => {
  const { parentMove, squashedParentMove } = findParentMoves(
    change,
    previousChanges,
    encounteredMoves
  )

  // We found a parent move and it has been squashed with its own parent move
  if (parentMove && squashedParentMove) {
    if (remoteChange.isOnlyChildMove(parentMove, change)) {
      const descendantChange = buildDescendantChange(change, squashedParentMove)
      remoteChange.includeDescendant(squashedParentMove, descendantChange)
      if (descendantChange.type === 'DescendantDirMove') {
        encounteredMoves.push(_.cloneDeep(descendantChange))
      }
      return descendantChange
    } else {
      if (change.type === 'DirMove') {
        encounteredMoves.push(_.cloneDeep(change))
      }
      return buildMoveInsideMove(change, squashedParentMove)
    }
  }

  // We found an unsquashed parent move
  if (parentMove) {
    if (remoteChange.isOnlyChildMove(parentMove, change)) {
      const descendantChange = buildDescendantChange(change, parentMove)
      remoteChange.includeDescendant(parentMove, descendantChange)
      if (descendantChange.type === 'DescendantDirMove') {
        encounteredMoves.push(_.cloneDeep(descendantChange))
      }
      return descendantChange
    } else {
      if (change.type === 'DirMove') {
        encounteredMoves.push(_.cloneDeep(change))
      }
      return buildMoveInsideMove(change, parentMove)
    }
  }

  // We didn't find any parent move
  return change
}

const squashChildren = (
  change /*: RemoteDirMove|RemoteDescendantDirMove */,
  previousChanges /*: RemoteChange[] */,
  encounteredMoves /*: Array<RemoteDirMove|RemoteDescendantDirMove> */
) => {
  const originalChange = encounteredMoves.find(
    move => metadata.id(move.doc.path) === metadata.id(change.doc.path)
  )
  const childrenMoves = findChildrenMoves(
    change,
    originalChange,
    previousChanges
  )

  for (const childMove of childrenMoves) {
    if (
      remoteChange.isOnlyChildMove(change, childMove) ||
      (originalChange &&
        remoteChange.isOnlyChildMove(originalChange, childMove))
    ) {
      const descendantChange = buildDescendantChange(childMove, change)
      remoteChange.includeDescendant(change, descendantChange)
      // Child move is already in previousChanges and needs to be updated
      _.assign(childMove, descendantChange)
    } else {
      remoteChange.applyMoveInsideMove(change, childMove)
    }
    if (childMove.type === 'DirMove' || childMove.type === 'DescendantDirMove')
      encounteredMoves.push(_.cloneDeep(childMove))
  }
}

const squashMoves = (
  doc /*: Metadata */,
  was /*: SavedMetadata */,
  previousChanges /*: RemoteChange[] */,
  encounteredMoves /*: Array<RemoteDirMove|RemoteDescendantDirMove> */
) /*: RemoteDirMove|RemoteFileMove|RemoteDescendantDirMove|RemoteDescendantFileMove */ => {
  // $FlowFixMe we have already preocessed changes with mismatching doc and was
  const change /*: RemoteDirMove|RemoteFileMove */ = buildChange(
    sideName,
    doc,
    was
  )
  if (change.type === 'DirMove') {
    encounteredMoves.push(_.cloneDeep(change))
  }

  for (const previousChange of previousChanges) {
    if (
      previousChange.type === 'FileTrashing' &&
      change.type === 'FileMove' &&
      metadata.samePath(previousChange.was, change.doc)
    ) {
      _.assign(previousChange, {
        type: 'IgnoredChange',
        detail: `File ${previousChange.was.path} overwritten by ${change.was.path}`
      })
      change.doc.overwrite = previousChange.was
      return change
    }

    if (
      previousChange.type === 'DirTrashing' &&
      change.type === 'DirMove' &&
      metadata.samePath(previousChange.was, change.doc)
    ) {
      _.assign(previousChange, {
        type: 'IgnoredChange',
        detail: `Folder ${previousChange.was.path} overwritten by ${change.was.path}`
      })
      change.doc.overwrite = previousChange.was
      return change
    }
  }

  const squashedChange = squashedWithParent(
    change,
    previousChanges,
    encounteredMoves
  )

  if (
    squashedChange.type === 'DirMove' ||
    squashedChange.type === 'DescendantDirMove'
  ) {
    squashChildren(squashedChange, previousChanges, encounteredMoves)
  }

  return squashedChange
}

module.exports = squashMoves
