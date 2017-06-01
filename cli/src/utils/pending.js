/* @flow */

import path from 'path'

// A pending operation e.g. on a file or a folder.
export interface Pending { // eslint-disable-line no-undef
  execute (): void;
  stopChecking (): void;
}

// A map of pending operations
export class PendingMap {
  map: Map<string, Pending>; // eslint-disable-line no-undef

  constructor () {
    this.map = new Map()
  }

  add (path: string, pending: Pending) { // eslint-disable-line no-undef
    this.map.set(path, pending)
  }

  executeAll () {
    for (const pending of this.map.values()) {
      pending.execute()
    }
  }

  executeIfAny (path: string) {
    const pending = this.map.get(path)
    if (pending) {
      this.clear(path)
      pending.execute()
    }
  }

  isEmpty (): boolean {
    return this.map.size === 0
  }

  hasPath (path: string): boolean {
    return this.map.has(path)
  }

  hasParentPath (childPath: string) {
    return this.map.has(path.dirname(childPath))
  }

  // Returns true if a direct sub-folder/file of the given path is pending
  hasPendingChild (folderPath: string) {
    for (const key of this.map.keys()) {
      if (path.dirname(key) === folderPath) {
        return true
      }
    }
    return false
  }

  clear (path: string) {
    const pending = this.map.get(path)
    if (pending) {
      pending.stopChecking()
      this.map.delete(path)
    }
  }
}
