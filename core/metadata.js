/** Metadata of synchronized files & directories.
 *
 * ### File
 *
 * - `_id`: the normalized path
 * - `_rev`: from PouchDB
 * - `docType`: always 'file'
 * - `path`: the original path to this file
 * - `md5sum`: a checksum of its content
 * - `updated_at`: date and time of the last modification
 * - `tags`: the list of tags, from the remote cozy
 * - `size`: the size on disk
 * - `class`: generic class of the mime-type (can be document, image, etc.)
 * - `mime`: the precise mime-type (example: image/jpeg)
 * - `remote`: id and rev of the associated documents in the remote CouchDB
 * - `sides`: for tracking what is applied on local file system and remote cozy
 * - `executable`: true if the file is executable (UNIX permission), undefined else
 * - `errors`: the number of errors while applying the last modification
 *
 * ### Folder
 *
 * - `_id`: the normalized path
 * - `_rev`: from PouchDB
 * - `docType`: always 'folder'
 * - `path`: the original path to this file
 * - `updated_at`: date and time of the last modification
 * - `tags`: the list of tags, from the remote cozy
 * - `remote`: id and rev of the associated documents in the remote CouchDB
 * - `sides`: for tracking what is applied on local file system and remote cozy
 * - `errors`: the number of errors while applying the last modification
 *
 * @module core/metadata
 * @flow
 */

const _ = require('lodash')
const { clone } = _
const mime = require('./utils/mime')
const deepDiff = require('deep-diff').diff
const path = require('path')

const logger = require('./utils/logger')
const timestamp = require('./utils/timestamp')
const fsutils = require('./utils/fs')

const {
  detectPathIncompatibilities,
  detectPathLengthIncompatibility
} = require('./incompatibilities/platform')
const { DIR_TYPE, FILE_TYPE } = require('./remote/constants')
const { SIDE_NAMES, otherSide } = require('./side')

/*::
import type fs from 'fs'
import type { PlatformIncompatibility } from './incompatibilities/platform'
import type { RemoteDoc } from './remote/document'
import type { Stats } from './local/stater'
import type { Ignore } from './ignore'
import type { SideName } from './side'
import type { EventKind } from './local/atom/event'
*/

const log = logger({
  component: 'Metadata'
})

const { platform } = process

const DATE_REGEXP = '\\d{4}(?:-\\d{2}){2}T(?:\\d{2}_?){3}\\.\\d{3}Z'
const SEPARATOR_REGEXP = `(?!.*\\${path.sep}.*)`
const CONFLICT_REGEXP = new RegExp(
  `-conflict-${DATE_REGEXP}${SEPARATOR_REGEXP}`
)

/*::
export type DocType =
  | "file"
  | "folder";

export type MetadataRemoteInfo = {
  _id: string,
  _rev: string
}

type RemoteID = string
type RemoteRev = string
export type RemoteRevisionsByID = { [RemoteID] : RemoteRev}

export type MetadataSidesInfo = {
  target: number,
  remote?: number,
  local?: number
}

// The files/dirs metadata, as stored in PouchDB
export type Metadata = {
  _deleted?: true,
  deleted?: true,
  _id: string,
  _rev?: string,
  md5sum?: string,
  class?: string,
  docType: DocType,
  errors?: number,
  executable?: true,
  updated_at: string,
  mime?: string,
  moveTo?: string, // Destination id
  overwrite?: Metadata,
  childMove?: boolean,
  path: string,
  remote: MetadataRemoteInfo,
  size?: number,
  tags?: string[],
  sides: MetadataSidesInfo,
  trashed?: true,
  incompatibilities?: *,
  ino?: ?number,
  fileid?: ?string,
  moveFrom?: Metadata,
  cozyMetadata?: Object,
  metadata?: Object
}
*/

let id /*: string => string */ = () => ''

// See [test/world/](https://github.com/cozy-labs/cozy-desktop/blob/master/test/world/)
// for file system behavior examples.
switch (platform) {
  case 'linux':
  case 'freebsd':
  case 'sunos':
    id = idUnix
    break
  case 'darwin':
    id = idApfsOrHfs
    break
  case 'win32':
    id = idNTFS
    break
  default:
    throw new Error(`Sorry, ${platform} is not supported!`)
}

module.exports = {
  assignId,
  assignMaxDate,
  assignPlatformIncompatibilities,
  fromRemoteDoc,
  isFile,
  kind,
  id,
  invalidPath,
  invariants,
  ensureValidPath,
  detectIncompatibilities,
  invalidChecksum,
  ensureValidChecksum,
  extractRevNumber,
  isUpToDate,
  isAtLeastUpToDate,
  removeActionHints,
  dissociateRemote,
  markAsNew,
  markAsUnsyncable,
  markAsUpToDate,
  sameFolder,
  sameFile,
  sameFileIgnoreRev,
  sameBinary,
  detectSingleSide,
  markSide,
  incSides,
  side,
  target,
  wasSynced,
  buildDir,
  buildFile,
  outOfDateSide,
  createConflictingDoc,
  CONFLICT_REGEXP,
  shouldIgnore
}

function localDocType(remoteDocType /*: string */) /*: string */ {
  switch (remoteDocType) {
    case FILE_TYPE:
      return 'file'
    case DIR_TYPE:
      return 'folder'
    default:
      throw new Error(`Unexpected Cozy Files type: ${remoteDocType}`)
  }
}

// Transform a remote document into metadata, as stored in Pouch.
// Please note the path is not normalized yet!
// Normalization is done as a side effect of metadata.invalidPath() :/
function fromRemoteDoc(remoteDoc /*: RemoteDoc */) /*: Metadata */ {
  const doc /*: Object */ = {
    path: remoteDoc.path.substring(1),
    docType: localDocType(remoteDoc.type),
    updated_at: remoteDoc.updated_at,
    remote: {
      _id: remoteDoc._id,
      _rev: remoteDoc._rev
    }
  }

  if (remoteDoc.size) {
    doc.size = parseInt(remoteDoc.size, 10)
  }

  const fields = Object.getOwnPropertyNames(remoteDoc).filter(
    field =>
      // Filter out fields already used above
      !['_id', '_rev', '_type', 'path', 'type', 'updated_at', 'size'].includes(
        field
      )
  )
  for (const field of fields) {
    if (remoteDoc[field]) {
      doc[field] = remoteDoc[field]
    }
  }

  return doc
}

function isFile(doc /*: Metadata */) /*: bool */ {
  return doc.docType === 'file'
}

function kind(doc /*: Metadata */) /*: EventKind */ {
  return doc.docType == null
    ? 'file'
    : doc.docType === 'folder'
    ? 'directory'
    : doc.docType
}

// Build an _id from the path for a case sensitive file system (Linux, BSD)
function idUnix(fpath /*: string */) {
  return fpath
}

// Build an _id from the path for macOS, assuming file system is either APFS
// or HFS+.
//
// APFS:
// - case preservative, but not case sensitive
// - unicode normalization preservative, but not sensitive
//
// HFS+:
// - case preservative, but not case sensitive
// - unicode NFD normalization (sort of)
//
// See https://nodejs.org/en/docs/guides/working-with-different-filesystems/
// for why toUpperCase is better than toLowerCase
//
// We are using NFD (Normalization Form Canonical Decomposition), but NFC
// would be fine too. We just need to make sure that 2 files which cannot
// coexist on APFS or HFS+ have the same identity.
//
// Note: String.prototype.normalize is not available on node 0.10 and does
// nothing when node is compiled without intl option.
function idApfsOrHfs(fpath /*: string */) {
  let id = fpath
  if (id.normalize) {
    id = id.normalize('NFD')
  }
  return id.toUpperCase()
}

// Build an _id from the path for Windows (NTFS file system)
function idNTFS(fpath /*: string */) {
  return fpath.toUpperCase()
}

// Assign an Id to a document
function assignId(doc /*: any */) {
  doc._id = id(doc.path)
}

// Return true if the document has not a valid path
// (ie a path inside the mount point).
// Normalizes the path as a side-effect.
// TODO: Separate normalization (side-effect) from validation (pure).
function invalidPath(doc /*: {path: string} */) {
  if (!doc.path) {
    return true
  }
  doc.path = path.normalize(doc.path)
  if (doc.path.startsWith(path.sep)) {
    doc.path = doc.path.slice(1)
  }
  let parts = doc.path.split(path.sep)
  return doc.path === '.' || doc.path === '' || parts.indexOf('..') >= 0
}

// Same as invalidPath, except it throws an exception when path is invalid.
function ensureValidPath(doc /*: {path: string} */) {
  if (invalidPath(doc)) {
    log.warn(
      { path: doc.path },
      `Invalid path: ${JSON.stringify(doc, null, 2)}`
    )
    throw new Error('Invalid path')
  }
}

function invariants(doc /*: Metadata */) {
  let err
  if (!doc.sides) {
    err = new Error(`Metadata has no sides`)
  } else if (doc.sides.remote && !doc.remote) {
    err = new Error(`Metadata has 'sides.remote' but no remote`)
  } else if (doc.docType === 'file' && doc.md5sum == null) {
    err = new Error(`File metadata has no checksum`)
  }

  if (err) {
    log.error({ err, path: doc.path, sentry: true }, err.message)
    throw err
  }

  return doc
}

/*::
export type Incompatibility = PlatformIncompatibility & {docType: string}
*/

/** Identify incompatibilities that will prevent synchronization.
 *
 * @see module:core/incompatibilities/platform
 */
function detectIncompatibilities(
  metadata /*: Metadata */,
  syncPath /*: string */
) /*: Array<Incompatibility> */ {
  const pathLenghIncompatibility = detectPathLengthIncompatibility(
    path.join(syncPath, metadata.path),
    platform
  )
  const incompatibilities /*: PlatformIncompatibility[] */ = detectPathIncompatibilities(
    metadata.path,
    metadata.docType
  )
  if (pathLenghIncompatibility) {
    incompatibilities.unshift(pathLenghIncompatibility)
  }
  // TODO: return null instead of an empty array when no issue was found?
  return incompatibilities.map(issue =>
    _.merge(
      {
        docType: issue.path === metadata.path ? metadata.docType : 'folder'
      },
      issue
    )
  )
}

function assignPlatformIncompatibilities(
  doc /*: Metadata */,
  syncPath /*: string */
) /*: void */ {
  const incompatibilities = detectIncompatibilities(doc, syncPath)
  if (incompatibilities.length > 0) doc.incompatibilities = incompatibilities
}

// Return true if the checksum is invalid
// If the checksum is missing, it is invalid.
// MD5 has 16 bytes.
// Base64 encoding must include padding.
function invalidChecksum(doc /*: Metadata */) {
  if (doc.md5sum == null) return doc.docType === 'file'

  const buffer = Buffer.from(doc.md5sum, 'base64')

  return buffer.byteLength !== 16 || buffer.toString('base64') !== doc.md5sum
}

function ensureValidChecksum(doc /*: Metadata */) {
  if (invalidChecksum(doc)) {
    log.warn({ path: doc.path, doc }, 'Invalid checksum')
    throw new Error('Invalid checksum')
  }
}

// Extract the revision number, or 0 it not found
function extractRevNumber(doc /*: Metadata|{_rev: string} */) {
  try {
    // $FlowFixMe
    let rev = doc._rev.split('-')[0]
    return Number(rev)
  } catch (error) {
    return 0
  }
}

// Return true if the remote file is up-to-date for this document
function isUpToDate(sideName /*: SideName */, doc /*: Metadata */) {
  return side(doc, sideName) === target(doc)
}

function isAtLeastUpToDate(sideName /*: SideName */, doc /*: Metadata */) {
  return side(doc, sideName) >= target(doc)
}

function removeActionHints(doc /*: Metadata */) {
  if (doc.sides) {
    // We remove parts of sides individually because of the invariant on sides
    if (doc.sides.local) delete doc.sides.local
    if (doc.sides.remote) delete doc.sides.remote
    if (doc.sides.target) delete doc.sides.target
  }
  if (doc.moveFrom) delete doc.moveFrom
  if (doc.moveTo) delete doc.moveTo
}

function dissociateRemote(doc /*: Metadata */) {
  if (doc.sides && doc.sides.remote) delete doc.sides.remote
  if (doc.remote) delete doc.remote
}

function markAsUnsyncable(doc /*: Metadata */) {
  removeActionHints(doc)
  dissociateRemote(doc)
  doc._deleted = true
}

function markAsNew(doc /*: Metadata */) {
  removeActionHints(doc)
  if (doc._rev) delete doc._rev
}

function markAsUpToDate(doc /*: Metadata */) {
  const newTarget = target(doc) + 1
  doc.sides = {
    target: newTarget,
    local: newTarget,
    remote: newTarget
  }
  delete doc.errors
  return newTarget
}

function outOfDateSide(doc /*: Metadata */) /*: ?SideName */ {
  const localRev = _.get(doc, 'sides.local', 0)
  const remoteRev = _.get(doc, 'sides.remote', 0)
  if ((localRev === 0 || remoteRev === 0) && doc._deleted) {
    return null
  } else if (localRev > remoteRev) {
    return 'remote'
  } else if (remoteRev > localRev) {
    return 'local'
  }
}

// Ensure new timestamp is never older than the previous one
function assignMaxDate(doc /*: Metadata */, was /*: ?Metadata */) {
  if (was == null) return
  const wasUpdatedAt = new Date(was.updated_at)
  const docUpdatedAt = new Date(doc.updated_at)
  if (docUpdatedAt < wasUpdatedAt) {
    doc.updated_at = was.updated_at
  }
}

const ensureExecutable = (one, two) => {
  two =
    process.platform === 'win32'
      ? _.defaults({ executable: one.executable }, two)
      : two
  return [
    _.merge({ executable: !!one.executable }, one),
    _.merge({ executable: !!two.executable }, two)
  ]
}

const makeComparator = (name, interestingFields) => {
  const interestingPaths = interestingFields.map(f => f.split('.'))
  const filter = (path, key) => {
    return !interestingPaths.some(interestingPath => {
      return interestingPath.every((part, i) => {
        if (i < path.length) return path[i] === part
        if (i === path.length) return key === part
        return true
      })
    })
  }
  const canBeIgnoredDiff = difference => {
    const diff = difference.item || difference
    return _.isNil(diff.lhs) && _.isNil(diff.rhs)
  }
  return (one, two) => {
    const diff = deepDiff(one, two, filter)
    log.trace({ path: two.path, diff }, name)
    if (diff && !_.every(diff, canBeIgnoredDiff)) {
      return false
    }
    // XXX The fileid can be missing in some old documents in pouchdb.
    // So, we compare them only if it's present on both documents.
    if (process.platform === 'win32' && one.fileid && two.fileid) {
      return one.fileid === two.fileid
    }
    return true
  }
}

const sameFolderComparator = makeComparator('sameFolder', [
  'path',
  'docType',
  'remote',
  'tags',
  'trashed',
  'ino'
])

// Return true if the metadata of the two folders are the same
function sameFolder(one /*: Metadata */, two /*: Metadata */) {
  return sameFolderComparator(one, two)
}

const sameFileComparator = makeComparator('sameFile', [
  'path',
  'docType',
  'md5sum',
  'remote._id',
  'remote._rev',
  'tags',
  'size',
  'trashed',
  'ino',
  'executable'
])

const sameFileIgnoreRevComparator = makeComparator('sameFileIgnoreRev', [
  'path',
  'docType',
  'md5sum',
  'remote._id',
  'tags',
  'size',
  'trashed',
  'ino',
  'executable'
])

// Return true if the metadata of the two files are the same
function sameFile(one /*: Metadata */, two /*: Metadata */) {
  ;[one, two] = ensureExecutable(one, two)
  return sameFileComparator(one, two)
}

// Return true if the metadata of the two files are the same,
// ignoring revision
function sameFileIgnoreRev(one /*: Metadata */, two /*: Metadata */) {
  ;[one, two] = ensureExecutable(one, two)
  return sameFileIgnoreRevComparator(one, two)
}

// Return true if the two files have the same binary content
function sameBinary(one /*: Metadata */, two /*: Metadata */) {
  return one.md5sum === two.md5sum
}

// Mark the next rev for this side
//
// To track which side has made which modification, a revision number is
// associated to each side. When a side make a modification, we extract the
// revision from the previous state, increment it by one to have the next
// revision and associate this number to the side that makes the
// modification.
function markSide(
  side /*: string */,
  doc /*: Metadata */,
  prev /*: ?Metadata */
) /*: Metadata */ {
  const prevSides = prev && prev.sides
  const prevTarget = target(prev)

  if (doc.sides == null) {
    doc.sides = clone(prevSides || { target: prevTarget })
  }
  doc.sides[side] = prevTarget + 1
  doc.sides.target = prevTarget + 1
  return doc
}

function incSides(doc /*: Metadata */) /*: void */ {
  const prevTarget = target(doc)
  const local = side(doc, 'local')
  const remote = side(doc, 'remote')

  if (prevTarget) {
    doc.sides.target = prevTarget + 1
    if (local) doc.sides.local = local + 1
    if (remote) doc.sides.remote = remote + 1
  }
}

function target(doc /*: ?Metadata */) /*: number */ {
  return (doc && doc.sides && doc.sides.target) || 0
}

function side(doc /*: Metadata */, sideName /*: SideName */) /*: number */ {
  return (doc.sides || {})[sideName] || 0
}

function detectSingleSide(doc /*: Metadata */) /*: ?SideName */ {
  if (doc.sides) {
    for (const sideName of SIDE_NAMES) {
      if (doc.sides[sideName] && !doc.sides[otherSide(sideName)]) {
        return sideName
      }
    }
  }
}

function hasBothSides(doc /*: Metadata */) /*: boolean %checks */ {
  return doc.sides && doc.sides.local != null && doc.sides.remote != null
}

function wasSynced(doc /*: Metadata */) /*: boolean */ {
  const comesFromSyncedDoc /*: boolean */ = doc.moveFrom != null

  return hasBothSides(doc) || comesFromSyncedDoc
}

function buildDir(
  fpath /*: string */,
  stats /*: Stats */,
  remote /*: ?MetadataRemoteInfo */
) /*: Metadata */ {
  const doc /*: Object */ = {
    _id: id(fpath),
    path: fpath,
    docType: 'folder',
    updated_at: timestamp
      .fromDate(timestamp.maxDate(stats.mtime, stats.ctime))
      .toISOString(),
    ino: stats.ino,
    remote
  }
  if (stats.fileid) {
    doc.fileid = stats.fileid
  }
  return doc
}

const EXECUTABLE_MASK = 1 << 6

function buildFile(
  filePath /*: string */,
  stats /*: Stats */,
  md5sum /*: string */,
  remote /*: ?MetadataRemoteInfo */
) /*: Metadata */ {
  const mimeType = mime.lookup(filePath)
  const { mtime, ctime } = stats
  const doc /*: Object */ = {
    _id: id(filePath),
    path: filePath,
    docType: 'file',
    md5sum,
    ino: stats.ino,
    updated_at: timestamp
      .fromDate(timestamp.maxDate(mtime, ctime))
      .toISOString(),
    mime: mimeType,
    class: mimeType.split('/')[0],
    size: stats.size,
    remote
  }
  if (stats.mode && (+stats.mode & EXECUTABLE_MASK) !== 0) {
    doc.executable = true
  }
  if (stats.fileid) {
    doc.fileid = stats.fileid
  }
  return doc
}

function createConflictingDoc(doc /*: Metadata */) /*: Metadata */ {
  const newPath = CONFLICT_REGEXP.test(doc.path)
    ? replacePreviousConflictSuffix(doc.path)
    : addConflictSuffix(doc.path)

  const dst = _.cloneDeep(doc)
  dst.path = newPath
  dst._id = id(newPath)

  return dst
}

function conflictSuffix() /*: string */ {
  const date = fsutils.validName(new Date().toISOString())
  return `-conflict-${date}`
}

function replacePreviousConflictSuffix(filePath /*: string */) /*: string */ {
  return filePath.replace(CONFLICT_REGEXP, conflictSuffix())
}

function addConflictSuffix(filePath /*: string */) /*: string */ {
  const dirname = path.dirname(filePath)
  const extname = path.extname(filePath)
  const filename = path.basename(filePath, extname)
  const notTooLongFilename = filename.slice(0, 180)
  return `${path.join(
    dirname,
    notTooLongFilename
  )}${conflictSuffix()}${extname}`
}

function shouldIgnore(
  doc /*: Metadata */,
  ignoreRules /*: Ignore */
) /*: boolean */ {
  return ignoreRules.isIgnored({
    relativePath: doc._id,
    isFolder: doc.docType === 'folder'
  })
}
