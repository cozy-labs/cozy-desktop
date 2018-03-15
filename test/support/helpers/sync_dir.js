/* @flow */

import type { PathObject } from '../../../core/utils/path'

const Promise = require('bluebird')
const fs = require('fs-extra')
const path = require('path')

const { getPath } = require('../../../core/utils/path')

Promise.promisifyAll(fs)

class SyncDirTestHelpers {
  root: string

  constructor (root: string) {
    this.root = root
  }

  abspath (target: string|PathObject): string {
    return path.join(this.root, getPath(target))
  }

  existsSync (target: string|PathObject): Promise<bool> {
    return fs.existsSync(this.abspath(target))
  }

  async ensureDir (target: string|PathObject) {
    await fs.ensureDir(this.abspath(target))
  }

  async unlink (target: string|PathObject) {
    await fs.unlinkAsync(this.abspath(target))
  }

  async rmdir (target: string|PathObject) {
    await fs.rmdirSync(this.abspath(target))
  }
}

module.exports = {
  SyncDirTestHelpers
}
