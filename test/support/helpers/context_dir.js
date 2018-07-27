/* @flow */

const autoBind = require('auto-bind')
const Promise = require('bluebird')
const fs = require('fs-extra')
const path = require('path')

const checksumer = require('../../../core/local/checksumer')
const { getPath } = require('../../../core/utils/path')

Promise.promisifyAll(fs) // FIXME: Isn't fs-extra already promisified?
Promise.promisifyAll(checksumer)

/*:: import type { PathObject } from '../../../core/utils/path' */

// A directory in the context of which we want to perform many FS operations.
class ContextDir {
  /*::
  root: string
  */

  constructor (root /*: string */) {
    this.root = root
    autoBind(this)
  }

  abspath (target /*: string|PathObject */) /*: string */ {
    return path.join(this.root, getPath(target))
  }

  existsSync (target /*: string|PathObject */) /*: Promise<bool> */ {
    return fs.existsSync(this.abspath(target))
  }

  async ensureDir (target /*: string|PathObject */) {
    await fs.ensureDir(this.abspath(target))
  }

  async unlink (target /*: string|PathObject */) {
    await fs.unlinkAsync(this.abspath(target))
  }

  async rmdir (target /*: string|PathObject */) {
    await fs.rmdirSync(this.abspath(target))
  }

  async readFile (target /*: string|PathObject */) /*: Promise<string> */ {
    return fs.readFile(this.abspath(target), 'utf8')
  }

  async outputFile (target /*: string|PathObject */, data /*: string */) {
    return fs.outputFile(this.abspath(target), data)
  }

  async checksum (target /*: string|PathObject */) /*: Promise<string> */ {
    // $FlowFixMe
    return checksumer.computeChecksumAsync(this.abspath(target))
  }
}

module.exports = {
  ContextDir
}
