/* @flow */

const path = require('path')

const localToRemote = (p /*: string */) /*: string */ =>
  path.posix.join(path.posix.sep, ...p.split(path.sep))

const remoteToLocal = (p /*: string */) /*: string */ =>
  p.startsWith(path.posix.sep)
    ? path.normalize(p.substring(1))
    : path.normalize(p)

module.exports = {
  localToRemote,
  remoteToLocal
}
