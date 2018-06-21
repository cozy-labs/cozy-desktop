/* @flow */

const _ = require('lodash')
const { clone, isEqual, pick } = _
const mime = require('mime')
const path = require('path')
const { join } = path

const logger = require('./logger')
const { detectPathIssues, detectPathLengthIssue } = require('./path_restrictions')
const { maxDate } = require('./timestamp')

/*::
import type fs from 'fs'
import type { PathIssue } from './path_restrictions'
import type { PathObject } from './utils/path'
*/

const log = logger({
  component: 'Metadata'
})

/*::
export type SideName =
  | "local"
  | "remote";

export type MetadataRemoteInfo = {
  _id: string,
  _rev: string
}

export type MetadataSidesInfo = {
  remote?: number,
  local?: number
}

// The files/dirs metadata, as stored in PouchDB
export type Metadata = {
  _deleted?: true,
  _id: string,
  _rev?: string,
  md5sum?: string,
  class?: string,
  docType: string,
  errors?: number,
  executable?: true,
  updated_at: string|Date,
  mime?: string,
  moveTo?: string, // Destination id
  childMove?: boolean,
  path: string,
  remote: MetadataRemoteInfo,
  size?: number,
  tags?: string[],
  sides: MetadataSidesInfo,
  trashed?: true,
  incompatibilities?: *,
  ino?: ?number,
  moveFrom?: Metadata
}
*/

let assignId /*: (doc: *) => void */ = (_) => {}

switch (process.platform) {
  case 'linux': case 'freebsd': case 'sunos':
    assignId = assignIdUnix
    break
  case 'darwin':
    assignId = assignIdHFS
    break
  case 'win32':
    assignId = assignIdNTFS
    break
  default:
    throw new Error(`Sorry, ${process.platform} is not supported!`)
}

module.exports = {
  assignId,
  isFile,
  id,
  invalidPath,
  ensureValidPath,
  detectPlatformIncompatibilities,
  invalidChecksum,
  ensureValidChecksum,
  extractRevNumber,
  isUpToDate,
  sameFolder,
  sameFile,
  sameFileIgnoreRev,
  sameBinary,
  markSide,
  buildDir,
  buildFile
}

function isFile (doc /*: Metadata */) /*: bool */ {
  return doc.docType === 'file'
}

// Build an _id from the path for a case sensitive file system (Linux, BSD)
function assignIdUnix (doc /*: * */) {
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
function assignIdHFS (doc /*: * */) {
  let id = doc.path
  if (id.normalize) { id = id.normalize('NFD') }
  doc._id = id.toUpperCase()
}

// Build an _id from the path for Windows (NTFS file system)
function assignIdNTFS (doc /*: * */) {
  doc._id = doc.path.toUpperCase()
}

// Generate an id from the given path.
// Side-effect-free version of assignId().
// TODO: Use id() in assignId(), not the opposite.
function id (path /*: string */) {
  const doc /*: Object */ = {path}
  assignId(doc)
  return doc._id
}

// Return true if the document has not a valid path
// (ie a path inside the mount point).
// Normalizes the path as a side-effect.
// TODO: Separate normalization (side-effect) from validation (pure).
function invalidPath (doc /*: PathObject */) {
  if (!doc.path) { return true }
  doc.path = path.normalize(doc.path)
  if (doc.path.startsWith(path.sep)) {
    doc.path = doc.path.slice(1)
  }
  let parts = doc.path.split(path.sep)
  return (doc.path === '.') ||
          (doc.path === '') ||
          (parts.indexOf('..') >= 0)
}

// Same as invalidPath, except it throws an exception when path is invalid.
function ensureValidPath (doc /*: PathObject */) {
  if (invalidPath(doc)) {
    log.warn({path: doc.path}, `Invalid path: ${JSON.stringify(doc, null, 2)}`)
    throw new Error('Invalid path')
  }
}

/*::
export type PlatformIncompatibility = PathIssue & {docType: string}
*/

// Identifies platform incompatibilities in metadata that will prevent local
// synchronization
// TODO: return null instead of an empty array when no issue was found?
function detectPlatformIncompatibilities (metadata /*: Metadata */, syncPath /*: string */) /*: Array<PlatformIncompatibility> */ {
  const {path, docType} = metadata
  const pathLenghIssue = detectPathLengthIssue(join(syncPath, path), process.platform)
  const issues /*: PathIssue[] */ = detectPathIssues(path, docType)
  if (pathLenghIssue) issues.unshift(pathLenghIssue)
  return issues.map(issue => (_.merge({
    docType: issue.path === path ? docType : 'folder'
  }, issue)))
}

// Return true if the checksum is invalid
// If the checksum is missing, it is invalid.
// MD5 has 16 bytes.
// Base64 encoding must include padding.
function invalidChecksum (doc /*: Metadata */) {
  if (doc.md5sum == null) return doc.docType === 'file'

  const buffer = Buffer.from(doc.md5sum, 'base64')

  return buffer.byteLength !== 16 ||
    buffer.toString('base64') !== doc.md5sum
}

function ensureValidChecksum (doc /*: Metadata */) {
  if (invalidChecksum(doc)) {
    log.warn({path: doc.path}, `Invalid checksum: ${JSON.stringify(doc, null, 2)}`)
    throw new Error('Invalid checksum')
  }
}

// Extract the revision number, or 0 it not found
function extractRevNumber (infos /*: Metadata */) {
  try {
    // $FlowFixMe
    let rev = infos._rev.split('-')[0]
    return Number(rev)
  } catch (error) {
    return 0
  }
}

// Return true if the remote file is up-to-date for this document
function isUpToDate (side /*: SideName */, doc /*: Metadata */) {
  let currentRev = doc.sides[side] || 0
  let lastRev = extractRevNumber(doc)
  return currentRev === lastRev
}

// Return true if the metadata of the two folders are the same
// For updated_at, we accept up to 3s of differences because we can't
// rely on file systems to be precise to the millisecond.
function sameFolder (one /*: Metadata */, two /*: Metadata */) {
  const {path} = two
  let fields = ['_id', 'docType', 'remote', 'tags', 'trashed', 'ino']
  one = pick(one, fields)
  two = pick(two, fields)
  const same = isEqual(one, two)
  if (!same) log.trace({path, diff: {one, two}})
  return same
}

// Return true if the metadata of the two files are the same
// For updated_at, we accept up to 3s of differences because we can't
// rely on file systems to be precise to the millisecond.
function sameFile (one /*: Metadata */, two /*: Metadata */) {
  if (!sameFileIgnoreRev(one, two)) return false

  if ((one.remote && one.remote._rev) === (two.remote && two.remote._rev)) {
    return true
  } else {
    log.trace({path, diff: {one, two}})
  }
}

function sameFileIgnoreRev (one /*: Metadata */, two /*: Metadata */) {
  const {path} = two
  let fields = ['_id', 'docType', 'md5sum', 'remote._id', 'tags', 'size', 'trashed', 'ino']
  one = _.merge({executable: !!one.executable}, pick(one, fields))
  two = _.merge({executable: !!two.executable}, pick(two, fields))
  const same = isEqual(one, two)
  if (!same) log.trace({path, diff: {one, two}})
  return same
}

// Return true if the two files have the same binary content
function sameBinary (one /*: Metadata */, two /*: Metadata */) {
  return one.md5sum === two.md5sum
}

// Mark the next rev for this side
//
// To track which side has made which modification, a revision number is
// associated to each side. When a side make a modification, we extract the
// revision from the previous state, increment it by one to have the next
// revision and associate this number to the side that makes the
// modification.
function markSide (side /*: string */, doc /*: Metadata */, prev /*: ?Metadata */) /*: Metadata */ {
  let rev = 0
  if (prev) { rev = extractRevNumber(prev) }
  if (doc.sides == null) {
    const was = prev && prev.sides
    doc.sides = clone(was || {})
  }
  doc.sides[side] = ++rev
  return doc
}

function buildDir (path /*: string */, stats /*: fs.Stats */, remote /*: ?MetadataRemoteInfo */) /*: Metadata */ {
  const doc /*: Object */ = {
    _id: id(path),
    path,
    docType: 'folder',
    updated_at: maxDate(stats.mtime, stats.ctime),
    ino: stats.ino,
    sides: {},
    remote
  }
  return doc
}

const EXECUTABLE_MASK = 1 << 6

function buildFile (filePath /*: string */, stats /*: fs.Stats */, md5sum /*: string */, remote /*: ?MetadataRemoteInfo */) /*: Metadata */ {
  const mimeType = mime.lookup(filePath)
  const {mtime, ctime} = stats
  let doc /*: Object */ = {
    path: filePath,
    docType: 'file',
    md5sum,
    ino: stats.ino,
    updated_at: maxDate(mtime, ctime),
    mime: mimeType,
    class: mimeType.split('/')[0],
    size: stats.size,
    remote
  }
  if ((stats.mode & EXECUTABLE_MASK) !== 0) { doc.executable = true }
  return doc
}
