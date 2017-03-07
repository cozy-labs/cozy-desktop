/* @flow */

import find from 'lodash.find'
import path from 'path'

// A pending operation e.g. on a file or a folder.
export interface Pending { // eslint-disable-line no-undef
  execute (): void;
  stopChecking (): void;
}

// A map of pending operations
export class PendingMap {
  pending: {[path: string]: Pending}; // eslint-disable-line no-undef

  constructor () {
    this.pending = Object.create(null)  // ES6 map would be nice!
  }

  add (path: string, pending: Pending) { // eslint-disable-line no-undef
    this.pending[path] = pending
  }

  executeAll () {
    for (let _ in this.pending) {
      const pending = this.pending[_]
      pending.execute()
    }
  }

  executeIfAny (path: string) {
    if (this.pending[path]) { this.pending[path].execute() }
  }

  isEmpty (): boolean {
    const keys = Object.keys(this.pending)
    return (keys.length === 0)
  }

  hasPath (path: string): boolean {
    const keys = Object.keys(this.pending)
    return keys.indexOf(path) !== -1
  }

  // Returns true if a direct sub-folder/file of the given path is pending
  hasPendingChild (folderPath: string) {
    const ret = find(this.pending, (_, key) => path.dirname(key) === folderPath)
    return (ret != null)  // Coerce the returns to a boolean
  }

  clear (path: string) {
    this.pending[path].stopChecking()
    delete this.pending[path]
  }
}
