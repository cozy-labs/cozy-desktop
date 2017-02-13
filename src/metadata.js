/* @flow */

import path from 'path'
import printit from 'printit'

const log = printit()

// The files/dirs metadata, as stored in PouchDB
export type Metadata = {
  _id: string,
  _rev: string,
  // TODO: v3: Rename to md5sum to match remote
  checksum?: string,
  class?: string,
  creationDate: string,
  // TODO: v3: Use the same local *type fields as the remote ones
  docType: string,
  executable?: boolean,
  lastModification: string,
  mime?: string,
  path: string,
  remote: MetadataRemoteInfo,
  size?: string,
  tags: string[],
  sides: {
    remote: ?string,
    local: ?string
  }
}

export type MetadataRemoteInfo = {
  _id: string,
  _rev: string
}

export let buildId
switch (process.platform) {
  case 'linux': case 'freebsd': case 'sunos':
    buildId = buildIdUnix
    break
  case 'darwin':
    buildId = buildIdHFS
    break
  default:
    log.error(`Sorry, ${process.platform} is not supported!`)
    process.exit(1)
}

// Build an _id from the path for a case sensitive file system (Linux, BSD)
function buildIdUnix (doc: Metadata) {
  doc._id = doc.path
}

// Build an _id from the path for OSX (HFS+ file system):
// - case preservative, but not case sensitive
// - unicode NFD normalization (sort of)
//
// See https://nodejs.org/en/docs/guides/working-with-different-filesystems/
// for why toUpperCase is better than toLowerCase
//
// Note: String.prototype.normalize is not available on node 0.10 and does
// nothing when node is compiled without intl option.
function buildIdHFS (doc: Metadata) {
  let id = doc.path
  if (id.normalize) { id = id.normalize('NFD') }
  doc._id = id.toUpperCase()
}

// Return true if the document has not a valid path
// (ie a path inside the mount point)
export function invalidPath (doc: Metadata) {
  if (!doc.path) { return true }
  doc.path = path.normalize(doc.path)
  doc.path = doc.path.replace(/^\//, '')
  let parts = doc.path.split(path.sep)
  return (doc.path === '.') ||
          (doc.path === '') ||
          (parts.indexOf('..') >= 0)
}

// Return true if the checksum is invalid
// If the checksum is missing, it is not invalid, just missing,
// so it returns false.
// MD5 has 16 bytes.
// Base64 encoding must include padding.
export function invalidChecksum (doc: Metadata) {
  if (doc.checksum == null) return false

  const buffer = Buffer.from(doc.checksum, 'base64')

  return buffer.byteLength !== 16 ||
    buffer.toString('base64') !== doc.checksum
}
