/** Metadata of synchronized files & directories.
 *
 * ### File
 *
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
 * - `executable`: true if the file is executable (UNIX permission)
 * - `errors`: the number of errors while applying the last modification
 *
 * ### Folder
 *
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
const pathUtils = require('./utils/path')
const conflicts = require('./utils/conflicts')

const {
  detectPathIncompatibilities,
  detectPathLengthIncompatibility
} = require('./incompatibilities/platform')
const { DIR_TYPE, FILE_TYPE } = require('./remote/constants')
const { SIDE_NAMES, otherSide } = require('./side')

/*::
import type { PlatformIncompatibility } from './incompatibilities/platform'
import type { RemoteBase, RemoteFile, RemoteDir, RemoteDeletion } from './remote/document'
import type { Stats } from './local/stater'
import type { Ignore } from './ignore'
import type { SideName } from './side'
import type { EventKind } from './local/atom/event'
import type { PouchRecord } from './pouch'
*/

const log = logger({
  component: 'Metadata'
})

const { platform } = process

const LOCAL_ATTRIBUTES = [
  'path',
  'docType',
  'md5sum',
  'updated_at',
  'class',
  'mime',
  'size',
  // trashed
  'ino',
  'fileid',
  'executable'
]

/*::
export type DocType =
  | "file"
  | "folder";

export type MetadataLocalInfo = {
  class?: string,
  docType: DocType,
  executable: boolean,
  fileid?: string,
  ino?: number,
  path: string,
  md5sum?: string,
  mime?: string,
  size?: number,
  updated_at?: string,
}

export type MetadataRemoteFile = {| ...RemoteFile, path: string |}
export type MetadataRemoteDir = RemoteDir
export type MetadataRemoteInfo = MetadataRemoteFile|MetadataRemoteDir

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
  // Those attributes should not be included in this type
  _id?: string,
  _rev?: string,
  _deleted?: true,

  docType: DocType,
  path: string,
  updated_at: string,
  local: MetadataLocalInfo,
  remote: MetadataRemoteInfo,
  tags: string[],
  sides: MetadataSidesInfo,

  // File attributes
  executable: boolean,
  md5sum?: string,
  size?: number,
  mime?: string,
  class?: string,

  trashed?: true,
  deleted?: true,
  errors?: number,
  overwrite?: SavedMetadata,
  childMove?: boolean,
  incompatibilities?: *,
  ino?: number,
  fileid?: string,
  moveFrom?: SavedMetadata,
  cozyMetadata?: Object,
  metadata?: Object
}

export type SavedMetadata = PouchRecord & Metadata
*/

module.exports = {
  LOCAL_ATTRIBUTES,
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
  removeNoteMetadata,
  dissociateRemote,
  dissociateLocal,
  markAsUnmerged,
  markAsUnsyncable,
  markAsUpToDate,
  samePath,
  areParentChildPaths,
  newChildPath,
  sameFolder,
  sameFile,
  sameFileIgnoreRev,
  sameLocal,
  sameBinary,
  detectSingleSide,
  markSide,
  incSides,
  side,
  sideInfo,
  target,
  wasSynced,
  buildDir,
  buildFile,
  outOfDateSide,
  createConflictingDoc,
  shouldIgnore,
  updateLocal,
  updateRemote
}

function id(fpath /*: string */) {
  // See [test/world/](https://github.com/cozy-labs/cozy-desktop/blob/master/test/world/)
  // for file system behavior examples.
  switch (platform) {
    case 'linux':
    case 'freebsd':
    case 'sunos':
      return idUnix(fpath)
    case 'darwin':
      return idApfsOrHfs(fpath)
    case 'win32':
      return idNTFS(fpath)
    default:
      throw new Error(`Sorry, ${platform} is not supported!`)
  }
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
// Note: String.prototype.normalize does nothing when node is compiled without
// intl option.
function idApfsOrHfs(fpath /*: string */) {
  return fpath.normalize('NFD').toUpperCase()
}

// Build an _id from the path for Windows (NTFS file system)
function idNTFS(fpath /*: string */) {
  return fpath.toUpperCase()
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
function fromRemoteDoc(remoteDoc /*: MetadataRemoteInfo */) /*: Metadata */ {
  const doc =
    remoteDoc.type === FILE_TYPE
      ? fromRemoteFile(remoteDoc)
      : fromRemoteDir(remoteDoc)

  updateRemote(doc, remoteDoc)

  return doc
}

function fromRemoteDir(remoteDir /*: MetadataRemoteDir */) /*: Metadata */ {
  const doc /*: Object */ = {
    docType: localDocType(remoteDir.type),
    path: pathUtils.remoteToLocal(remoteDir.path),
    created_at: timestamp.roundedRemoteDate(remoteDir.created_at),
    updated_at: timestamp.roundedRemoteDate(remoteDir.updated_at)
  }

  const fields = Object.getOwnPropertyNames(remoteDir).filter(
    field =>
      // Filter out fields already used above
      ![
        '_id',
        '_rev',
        '_type',
        'path',
        'type',
        'created_at',
        'updated_at'
      ].includes(field)
  )
  for (const field of fields) {
    if (remoteDir[field]) {
      doc[field] = _.cloneDeep(remoteDir[field])
    }
  }

  return doc
}

function fromRemoteFile(remoteFile /*: MetadataRemoteFile */) /*: Metadata */ {
  const doc /*: Object */ = {
    docType: localDocType(remoteFile.type),
    path: pathUtils.remoteToLocal(remoteFile.path),
    size: parseInt(remoteFile.size, 10),
    executable: !!remoteFile.executable,
    created_at: timestamp.roundedRemoteDate(remoteFile.created_at),
    updated_at: timestamp.roundedRemoteDate(remoteFile.updated_at)
  }

  const fields = Object.getOwnPropertyNames(remoteFile).filter(
    field =>
      // Filter out fields already used above
      ![
        '_id',
        '_rev',
        '_type',
        'path',
        'type',
        'created_at',
        'updated_at',
        'size'
      ].includes(field)
  )
  for (const field of fields) {
    if (remoteFile[field]) {
      doc[field] = _.cloneDeep(remoteFile[field])
    }
  }

  return doc
}

function isFile(
  doc /*: Metadata|MetadataLocalInfo|MetadataRemoteInfo */
) /*: boolean %checks */ {
  return (
    (doc.docType != null && doc.docType === 'file') ||
    (doc.type !== null && doc.type === 'file')
  )
}

function kind(doc /*: Metadata */) /*: EventKind */ {
  return doc.docType == null
    ? 'file'
    : doc.docType === 'folder'
    ? 'directory'
    : doc.docType
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

function invariants /*:: <T: Metadata|SavedMetadata> */(doc /*: T */) {
  // If the record is meant to be erased we don't care about invariants
  if (doc._deleted) return doc

  let err
  if (!doc.sides) {
    err = new Error(`Metadata has no sides`)
  } else if (doc.sides.remote && !doc.remote) {
    err = new Error(`Metadata has 'sides.remote' but no remote`)
  } else if (doc.sides.local && !doc.local) {
    err = new Error(`Metadata has 'sides.local' but no local`)
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
export type Incompatibility = { ...PlatformIncompatibility, docType: string }
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
function extractRevNumber(doc /*: { _rev: string } */) {
  try {
    const rev = doc._rev.split('-')[0]
    return Number(rev)
  } catch (error) {
    return 0
  }
}

// See isAtLeastUpToDate for why we have different checks when we have both
// sides and when we don't.
function isUpToDate(sideName /*: SideName */, doc /*: Metadata */) {
  return hasBothSides(doc)
    ? side(doc, sideName) === target(doc)
    : side(doc, sideName) > 0
}

// It appears we can end up in situations where the only side left is smaller
// than the target.
// Since this function is meant to detect when it is safe to merge a change on
// one side because no changes were merged on the other one, we'll assume the
// remaining side is up-to-date (or at least up-to-date) if it's present.
//
// FIXME: find out how we end up in this situation, fix it and remove this
// mitigation.
function isAtLeastUpToDate(sideName /*: SideName */, doc /*: Metadata */) {
  return hasBothSides(doc)
    ? side(doc, sideName) >= target(doc)
    : side(doc, sideName) > 0
}

function removeActionHints(doc /*: Metadata */) {
  if (doc.sides) delete doc.sides
  if (doc.moveFrom) delete doc.moveFrom
}

function removeNoteMetadata(doc /*: Metadata */) {
  if (doc.metadata) {
    if (doc.metadata.content) delete doc.metadata.content
    if (doc.metadata.schema) delete doc.metadata.schema
    if (doc.metadata.title) delete doc.metadata.title
    if (doc.metadata.version) delete doc.metadata.version
  }
}

function dissociateRemote(doc /*: Metadata */) {
  if (doc.sides && doc.sides.remote) delete doc.sides.remote
  if (doc.remote) delete doc.remote
}

function dissociateLocal(doc /*: Metadata */) {
  if (doc.sides && doc.sides.local) delete doc.sides.local
  if (doc.local) delete doc.local
}

function markAsUnsyncable(doc /*: SavedMetadata */) {
  removeActionHints(doc)
  // Cannot be done in removeActionHints as markAsUnmerged uses it as well and
  // overwrite can be an attribute added before calling Merge (i.e. it can exist
  // on an unmerged record).
  delete doc.overwrite

  dissociateRemote(doc)
  dissociateLocal(doc)
  doc._deleted = true
}

function markAsUnmerged(
  doc /*: Metadata|SavedMetadata */,
  sideName /*: SideName */
) {
  removeActionHints(doc)
  if (doc._id) delete doc._id
  if (doc._rev) delete doc._rev
  if (doc._deleted) delete doc._deleted
  if (sideName === 'local') {
    dissociateRemote(doc)
  } else {
    dissociateLocal(doc)
  }
}

function markAsUpToDate /*:: <T: Metadata|SavedMetadata> */(doc /*: T */) {
  const newTarget = target(doc) + 1
  doc.sides = {
    target: newTarget,
    local: newTarget,
    remote: newTarget
  }
  delete doc.errors
  return newTarget
}

function outOfDateSide /*:: <T: Metadata|SavedMetadata> */(
  doc /*: T */
) /*: ?SideName */ {
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

// TODO: move to core/utils/path and improve to compare local and remote paths safely
function samePath(
  one /*: string|{path:string} */,
  two /*: string|{path:string} */
) {
  const pathOne = typeof one === 'string' ? one : one.path
  const pathTwo = typeof two === 'string' ? two : two.path

  if (process.platform === 'darwin') {
    return pathOne.normalize() === pathTwo.normalize()
  } else {
    return pathOne === pathTwo
  }
}

// TODO: move to core/utils/path and improve to compare local and remote paths safely
function areParentChildPaths(
  parent /*: string|{path:string} */,
  child /*: string|{path:string} */
) {
  const parentPath = typeof parent === 'string' ? parent : parent.path
  const childPath = typeof child === 'string' ? child : child.path

  if (process.platform === 'darwin') {
    return childPath.normalize().startsWith(parentPath.normalize() + path.sep)
  } else {
    return childPath.startsWith(parentPath + path.sep)
  }
}

// TODO: move to core/utils/path and improve to work with local and remote paths safely
function newChildPath(
  oldChildPath /*: string */,
  oldParentPath /*: string */,
  newParentPath /*: string */
) {
  const parentParts = oldParentPath.split(path.sep)
  const childParts = oldChildPath.split(path.sep)

  // We keep only the old child parts that are within in the old parent path, no
  // matter what their normalizations are within both paths.
  return path.join(newParentPath, ...childParts.slice(parentParts.length))
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
    if (two.path) {
      log.trace({ path: two.path, diff }, name)
    } else {
      log.trace({ diff }, name)
    }
    if (diff && !_.every(diff, canBeIgnoredDiff)) {
      return false
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
  'ino',
  'fileid'
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
  'fileid',
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
  'fileid',
  'executable'
])

const sameLocalComparator = makeComparator('sameLocal', LOCAL_ATTRIBUTES)

// Return true if the metadata of the two files are the same
function sameFile /*::<T: Metadata|MetadataLocalInfo>*/(
  one /*: T */,
  two /*: T */
) {
  return sameFileComparator(one, two)
}

// Return true if the metadata of the two files are the same,
// ignoring revision
function sameFileIgnoreRev(one /*: Metadata */, two /*: Metadata */) {
  return sameFileIgnoreRevComparator(one, two)
}

function sameLocal(one /*: MetadataLocalInfo */, two /*: MetadataLocalInfo */) {
  return sameLocalComparator(one, two)
}

// Return true if the two files have the same binary content
function sameBinary(
  one /*: { md5sum: string }|{ md5sum?: string } */,
  two /*: { md5sum: string }|{ md5sum?: string } */
) /*: boolean %checks */ {
  return !!one.md5sum && !!two.md5sum && one.md5sum === two.md5sum
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

function target(doc /*: ?$ReadOnly<Metadata> */) /*: number */ {
  return (doc && doc.sides && doc.sides.target) || 0
}

function side(
  doc /*: $ReadOnly<Metadata> */,
  sideName /*: SideName */
) /*: number */ {
  return (doc.sides || {})[sideName] || 0
}

function sideInfo(sideName /*: SideName */, doc /*: Metadata */) {
  if (sideName === 'local') return doc.local
  else return doc.remote
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
  const doc /*: $Shape<Metadata> */ = {
    path: fpath,
    docType: 'folder',
    updated_at: stats.mtime.toISOString(),
    ino: stats.ino,
    tags: []
  }
  // FIXME: we should probably not set remote at this point
  if (remote) {
    doc.remote = remote
  }
  if (typeof stats.fileid === 'string') {
    doc.fileid = stats.fileid
  }
  updateLocal(doc)
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
  const className = mimeType.split('/')[0]
  const { mtime, ino, size } = stats
  const updated_at = mtime.toISOString()
  const executable = stats.mode ? (+stats.mode & EXECUTABLE_MASK) !== 0 : false

  const doc /*: $Shape<Metadata> */ = {
    path: filePath,
    docType: 'file',
    md5sum,
    ino,
    updated_at,
    mime: mimeType,
    class: className,
    size,
    executable,
    tags: []
  }
  // FIXME: we should probably not set remote at this point
  if (remote) {
    doc.remote = remote
  }
  if (typeof stats.fileid === 'string') {
    doc.fileid = stats.fileid
  }
  updateLocal(doc)
  return doc
}

function createConflictingDoc(doc /*: Metadata */) /*: Metadata */ {
  const dst = _.cloneDeep(doc)
  dst.path = conflicts.generateConflictPath(doc.path)

  return dst
}

function shouldIgnore(
  doc /*: Metadata */,
  ignoreRules /*: Ignore */
) /*: boolean */ {
  return ignoreRules.isIgnored({
    relativePath: id(doc.path),
    isFolder: doc.docType === 'folder'
  })
}

function updateLocal(doc /*: Metadata */, newLocal /*: Object */ = {}) {
  const defaults = process.platform === 'win32' ? { executable: false } : {}

  doc.local = _.pick(
    _.defaults(defaults, _.cloneDeep(newLocal), _.cloneDeep(doc)),
    LOCAL_ATTRIBUTES
  )
}

function updateRemote(
  doc /*: Metadata */,
  newRemote /*: {| path: string |}|MetadataRemoteInfo */
) {
  doc.remote = _.defaultsDeep(
    {
      path: pathUtils.localToRemote(newRemote.path) // Works also if newRmote.path is formated as a remote path
    },
    newRemote.created_at != null
      ? {
          created_at: timestamp.roundedRemoteDate(newRemote.created_at)
        }
      : {},
    newRemote.updated_at != null
      ? {
          updated_at: timestamp.roundedRemoteDate(newRemote.updated_at)
        }
      : {},
    _.cloneDeep(newRemote),
    _.cloneDeep(doc.remote)
  )
}
