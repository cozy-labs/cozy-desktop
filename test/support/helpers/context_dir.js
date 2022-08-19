/* @flow */

const autoBind = require('auto-bind')
const Promise = require('bluebird')
const fse = require('fs-extra')
const _ = require('lodash')
const path = require('path')
const rimraf = require('rimraf')

const checksumer = require('../../../core/local/checksumer')
const stater = require('../../../core/local/stater')
const { TMP_DIR_NAME } = require('../../../core/local/constants')

Promise.promisifyAll(checksumer)
const rimrafAsync = Promise.promisify(rimraf)

function getPath(target /*: string | {path: string} */) /*: string */ {
  return typeof target === 'string' ? target : target.path
}

function posixifyPath(localPath /*: string */) /*: string */ {
  return localPath.split(path.sep).join(path.posix.sep)
}

// A directory in the context of which we want to perform many FS operations.
class ContextDir {
  /*::
  root: string
  */

  constructor(root /*: string */) {
    this.root = root
    autoBind(this)
  }

  async clean() {
    for (const pattern of ['*', '.*']) {
      await rimrafAsync(path.join(this.root, pattern))
    }
  }

  abspath(target /*: string | {path: string} */) /*: string */ {
    return path.join(this.root, getPath(target))
  }

  relpath(abspath /*: string */) /*: string */ {
    return posixifyPath(abspath.slice(this.root.length + path.sep.length))
  }

  async makeTree(paths /*: Array<string> */) {
    for (const path of paths) {
      if (path.endsWith('/')) {
        await this.ensureDir(path)
      } else {
        await this.outputFile(path, '')
      }
    }
  }

  async tree(
    dirsToRead /*: string[] */ = [this.root]
  ) /*: Promise<string[]> */ {
    const relPaths = []

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const dir = dirsToRead.shift()
      if (dir == null) break

      for (const name of await fse.readdir(dir)) {
        const absPath = path.join(dir, name)
        const stat = await stater.stat(absPath)
        let relPath = this.relpath(absPath)

        if (stater.isDirectory(stat)) {
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

  async treeWithIno(
    dirsToRead /*: string[] */ = [this.root]
  ) /*: Promise<Array<{ ino: number, path: string }>> */ {
    const tree = []

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const dir = dirsToRead.shift()
      if (dir == null) break

      for (const name of await fse.readdir(dir)) {
        const absPath = path.join(dir, name)
        const stat = await stater.stat(absPath)
        let relPath = this.relpath(absPath)

        if (stater.isDirectory(stat)) {
          dirsToRead.push(absPath)
          relPath = relPath + path.posix.sep
        }

        tree.push({ path: relPath, ino: stat.ino, fileid: stat.fileid })
      }
    }

    return tree
      .sort((a, b) => a.path.localeCompare(b.path))
      .filter(relPath => relPath !== `${TMP_DIR_NAME}/`)
  }

  existsSync(target /*: string | {path: string} */) /*: bool */ {
    return fse.existsSync(this.abspath(target))
  }

  exists(target /*: string | {path: string} */) /*: Promise<bool> */ {
    return fse.exists(this.abspath(target))
  }

  emptyDir(target /*: string | {path: string} */) /*: Promise<void> */ {
    return fse.emptyDir(this.abspath(target))
  }

  async ensureDir(target /*: string | {path: string} */) {
    await fse.ensureDir(this.abspath(target))
  }

  async ensureParentDir(target /*: string | {path: string} */) {
    await this.ensureDir(path.dirname(getPath(target)))
  }

  async mtime(target /*: string | {path: string} */) /*: Promise<Date> */ {
    const stats = await this.stat(target)
    return stats.mtime
  }

  /** Octal string representation of file/dir mode, e.g. '755' */
  async octalMode(
    target /*: string | {path: string} */
  ) /*: Promise<string> */ {
    // The Stats object returned by `stater` does not contain the `mode` field
    // (at least on Windows) so we have to use the Node `stat` method instead.
    const stats = await fse.stat(this.abspath(target))
    return _.padStart((0o777 & stats.mode).toString(8), 3, '0')
  }

  async unlink(target /*: string | {path: string} */) {
    await fse.unlink(this.abspath(target))
  }

  async rmdir(target /*: string | {path: string} */) {
    await fse.rm(this.abspath(target), { recursive: true })
  }

  async readFile(
    target /*: string | {path: string} */,
    opts /*: * */ = 'utf8'
  ) /*: Promise<string> */ {
    return fse.readFile(this.abspath(target), opts)
  }

  async chmod(target /*: string | {path: string} */, mode /*: number */) {
    await fse.chmod(this.abspath(target), mode)
  }

  async utimes(target /*: string | {path: string} */, updatedAt /*: Date */) {
    await fse.utimes(this.abspath(target), updatedAt, updatedAt)
  }

  async ensureFileMode(
    target /*: string | {path: string} */,
    mode /*: number */
  ) {
    await fse.ensureFile(this.abspath(target))
    await this.chmod(target, mode) // Post-creation so it ignores umask
  }

  async ensureFile(target /*: string | {path: string} */) {
    return this.outputFile(target, '')
  }

  async outputFile(
    target /*: string | {path: string} */,
    data /*: string|Buffer */
  ) {
    return fse.outputFile(this.abspath(target), data)
  }

  async touchFile(target /*: string | {path: string} */) {
    const { S_IRUSR, S_IWUSR, S_IRGRP, S_IROTH } = fse.constants
    const mode = S_IRUSR | S_IWUSR | S_IRGRP | S_IROTH
    const file = await fse.open(this.abspath(target), 'w', mode)
    return fse.close(file)
  }

  async move(
    src /*: string */,
    dst /*: string */,
    opts /*: { overwrite: boolean } */ = { overwrite: false }
  ) {
    if (opts.overwrite) await this.remove(dst)
    return fse.rename(this.abspath(src), this.abspath(dst))
  }

  async checksum(target /*: string | {path: string} */) /*: Promise<string> */ {
    return checksumer.computeChecksumAsync(this.abspath(target))
  }

  stat(target /*: string | {path: string} */) /*: Promise<fse.Stat> */ {
    return stater.stat(this.abspath(target))
  }

  remove(target /*: string | {path: string} */) /*: Promise<void> */ {
    return fse.remove(this.abspath(target))
  }

  async removeParentDir(
    target /*: string | {path: string} */
  ) /*: Promise<void> */ {
    await fse.remove(this.abspath(path.dirname(getPath(target))))
  }

  async rename(target /*: string | {path: string} */, newName /*: string */) {
    const oldPath = this.abspath(target)
    const oldName = path.basename(oldPath)
    const newPath = oldPath.replace(oldName, newName)

    await fse.rename(oldPath, newPath)
  }
}

module.exports = {
  ContextDir,
  posixifyPath
}
