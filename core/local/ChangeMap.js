/* @flow */

/*::
import type { LocalChange } from './change'
import type { LocalEvent } from './event'
*/

module.exports = {
  init,
  put,
  byInode,
  byPath,
  toArray
}

/*::
type LocalChangeMap = {
  byInode: Map<number, LocalChange>,
  byPath: Map<string, LocalChange>,
  withoutInode: LocalChange[]
}
*/

function empty () /*: LocalChangeMap */ {
  return {
    byInode: new Map(),
    byPath: new Map(),
    withoutInode: [] // FIXME: Is it really needed?
  }
}

function init (pendingChanges /*: LocalChange[] */) /*: LocalChangeMap */ {
  const changes /*: LocalChangeMap */ = empty()
  for (const c of pendingChanges) { put(changes, c) }
  return changes
}

function put (changes /*: LocalChangeMap */, c /*: LocalChange */) {
  const previousChange /*: ?LocalChange */ = typeof c.ino === 'number'
    ? changes.byInode.get(c.ino)
    : null
  // FIXME: Is it really needed?
  if (previousChange && previousChange.path !== c.path) {
    changes.byPath.delete(previousChange.path)
    // FIXME: Is there anything to remove from changes.withoutInode?
  }
  changes.byPath.set(c.path, c)
  if (typeof c.ino === 'number') changes.byInode.set(c.ino, c)
  else changes.withoutInode.push(c)
}

function byInode (changes /*: LocalChangeMap */, ino /*: ?number */) /*: ?LocalChange */ {
  if (ino) return changes.byInode.get(ino)
  else return null
}

function byPath (changes /*: LocalChangeMap */, path /*: string */) /*: ?LocalChange */ {
  return changes.byPath.get(path)
}

function toArray (changes /*: LocalChangeMap */) /*: LocalChange[] */ {
  const array = Array.from(changes.withoutInode)
  for (let changeWithInode of changes.byInode.values()) array.push(changeWithInode)
  return array
}
