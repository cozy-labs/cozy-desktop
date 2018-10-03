/* @flow */

const autoBind = require('auto-bind')
const Promise = require('bluebird')
const fs = require('fs-extra')
const _ = require('lodash')
const path = require('path')

const checksumer = require('../../../core/local/checksumer')
const { TMP_DIR_NAME } = require('../../../core/local/constants')

Promise.promisifyAll(fs) // FIXME: Isn't fs-extra already promisified?
Promise.promisifyAll(checksumer)

function getPath (target /*: string | {path: string} */) /*: string */ {
  return typeof target === 'string' ? target : target.path
}

function posixifyPath (localPath /*: string */) /*: string */ {
  return localPath.split(path.sep).join(path.posix.sep)
}

// A directory in the context of which we want to perform many FS operations.
class ContextDir {
  /*::
  root: string
  */

  constructor (root /*: string */) {
    this.root = root
    autoBind(this)
  }

  abspath (target /*: string | {path: string} */) /*: string */ {
    return path.join(this.root, getPath(target))
  }

  relpath (abspath /*: string */) /*: string */ {
    return posixifyPath(abspath.slice(this.root.length + path.sep.length))
  }

  async tree () /*: Promise<string[]> */ {
    const dirsToRead = [this.root]
    const relPaths = []

    while (true) {
      const dir = dirsToRead.shift()
      if (dir == null) break

      for (const name of await fs.readdirAsync(dir)) {
        const absPath = path.join(dir, name)
        const stat = await fs.statAsync(absPath)
        let relPath = this.relpath(absPath)

        if (stat.isDirectory()) {
          dirsToRead.push(absPath)
          relPath = relPath + path.posix.sep
        }

        relPaths.push(relPath)
      }
    }

    return relPaths
      .sort((a, b) => a.localeCompare(b))
      .filter(relPath => relPath !== `${TMP_DIR_NAME}/`)
  }

  existsSync (target /*: string | {path: string} */) /*: bool */ {
    return fs.existsSync(this.abspath(target))
  }

  exists (target /*: string | {path: string} */) /*: Promise<bool> */ {
    return fs.exists(this.abspath(target))
  }

  emptyDir (target /*: string | {path: string} */) /*: Promise<void> */ {
    return fs.emptyDir(this.abspath(target))
  }

  async ensureDir (target /*: string | {path: string} */) {
    await fs.ensureDir(this.abspath(target))
  }

  async ensureParentDir (target /*: string | {path: string} */) {
    await this.ensureDir(path.dirname(getPath(target)))
  }

  async mtime (target /*: string | {path: string} */) /*: Promise<Date> */ {
    const stats = await this.stat(target)
    return stats.mtime
  }

  /** Octal string representation of file/dir mode, e.g. '755' */
  async octalMode (target /*: string | {path: string} */) /*: Promise<string> */ {
    const stats = await this.stat(target)
    return _.padStart((0o777 & stats.mode).toString(8), 3, '0')
  }

  async unlink (target /*: string | {path: string} */) {
    await fs.unlinkAsync(this.abspath(target))
  }

  async rmdir (target /*: string | {path: string} */) {
    await fs.rmdirSync(this.abspath(target))
  }

  async readFile (target /*: string | {path: string} */, opts /*: * */ = 'utf8') /*: Promise<string> */ {
    return fs.readFile(this.abspath(target), opts)
  }

  async chmod (target /*: string | {path: string} */, mode /*: number */) {
    await fs.chmod(this.abspath(target), mode)
  }

  async ensureFileMode (target /*: string | {path: string} */, mode /*: number */) {
    await fs.ensureFile(this.abspath(target))
    await this.chmod(target, mode) // Post-creation so it ignores umask
  }

  async outputFile (target /*: string | {path: string} */, data /*: string */) {
    return fs.outputFile(this.abspath(target), data)
  }

  async checksum (target /*: string | {path: string} */) /*: Promise<string> */ {
    return checksumer.computeChecksumAsync(this.abspath(target))
  }

  stat (target /*: string | {path: string} */) /*: Promise<fs.Stat> */ {
    return fs.stat(this.abspath(target))
  }

  remove (target /*: string | {path: string} */) /*: Promise<void> */ {
    return fs.remove(this.abspath(target))
  }

  async removeParentDir (target /*: string | {path: string} */) /*: Promise<void> */ {
    await fs.remove(this.abspath(path.dirname(getPath(target))))
  }

  async rename (target /*: string | {path: string} */, newName /*: string */) {
    const oldPath = this.abspath(target)
    const oldName = path.basename(oldPath)
    const newPath = oldPath.replace(oldName, newName)

    await fs.rename(oldPath, newPath)
  }
}

module.exports = {
  ContextDir,
  posixifyPath
}
