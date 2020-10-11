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
const { DIR_TYPE, FILE_TYPE, TRASH_DIR_ID } = require('./remote/constants')
const { SIDE_NAMES, otherSide } = require('./side')

/*::
import type { PlatformIncompatibility } from './incompatibilities/platform'
import type { RemoteBase, RemoteFile, RemoteDir } from './remote/document'
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

const LOCAL_ATTRIBUTES = [
  'md5sum',
  'class',
  'docType',
  'executable',
  'updated_at',
  'mime',
  'size',
  'ino',
  'fileid'
]

/*::
export type DocType =
  | "file"
  | "folder";

export type MetadataLocalInfo = {
  class?: string,
  docType: DocType,
  executable?: true,
  fileid?: string,
  ino?: number,
  md5sum?: string,
  mime?: string,
  size?: number,
  updated_at?: string,
}

export type MetadataRemoteFile = RemoteFile & { path: string }
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
  local: MetadataLocalInfo,
  remote: MetadataRemoteDir|MetadataRemoteFile,
  size?: number,
  tags?: string[],
  sides: MetadataSidesInfo,
  trashed?: true,
  incompatibilities?: *,
  ino?: number,
  fileid?: string,
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
  removeNoteMetadata,
  dissociateRemote,
  markAsNew,
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
  target,
  wasSynced,
  buildDir,
  buildFile,
  outOfDateSide,
  createConflictingDoc,
  CONFLICT_REGEXP,
  shouldIgnore,
  updateLocal,
  updateRemote
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
    path: remoteDir.path.substring(1),
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
    path: remoteFile.path.substring(1),
    size: parseInt(remoteFile.size, 10),
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

function markAsUnsyncable(doc /*: Metadata */) {
  removeActionHints(doc)
  dissociateRemote(doc)
  dissociateLocal(doc)
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
    if (two.path) {
      log.trace({ path: two.path, diff }, name)
    } else {
      log.trace({ diff }, name)
    }
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

const sameLocalComparator = makeComparator('sameLocal', LOCAL_ATTRIBUTES)

// Return true if the metadata of the two files are the same
function sameFile /*::<T: Metadata|MetadataLocalInfo>*/(
  one /*: T */,
  two /*: T */
) {
  ;[one, two] = ensureExecutable(one, two)
  return sameFileComparator(one, two)
}

// Return true if the metadata of the two files are the same,
// ignoring revision
function sameFileIgnoreRev(one /*: Metadata */, two /*: Metadata */) {
  ;[one, two] = ensureExecutable(one, two)
  return sameFileIgnoreRevComparator(one, two)
}

function sameLocal(one /*: MetadataLocalInfo */, two /*: MetadataLocalInfo */) {
  return sameLocalComparator(one, two)
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
    updated_at: stats.mtime.toISOString(),
    ino: stats.ino,
    remote
  }
  if (stats.fileid) {
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

  const doc /*: Object */ = {
    _id: id(filePath),
    path: filePath,
    docType: 'file',
    md5sum,
    ino,
    updated_at,
    mime: mimeType,
    class: className,
    size,
    remote
  }
  if (stats.mode && (+stats.mode & EXECUTABLE_MASK) !== 0) {
    doc.executable = true
  }
  if (stats.fileid) {
    doc.fileid = stats.fileid
  }
  updateLocal(doc, {
    updated_at: mtime.toISOString()
  })
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

function updateLocal(doc /*: Metadata */, newLocal /*: ?Object */ = {}) {
  // Boolean attributes not set in doc when false will not override an existing
  // truthy value.
  // This is the case for `executable` and we need to provide a default falsy
  // value to override the `newLocal` executable value in all cases.
  doc.local = _.pick(
    _.defaults(
      _.cloneDeep(newLocal),
      isFile(doc) ? { executable: false } : {},
      _.cloneDeep(doc)
    ),
    LOCAL_ATTRIBUTES
  )
}

function updateRemote(
  doc /*: Metadata */,
  newRemote /*: {| path: string |}|RemoteDir|RemoteBase */
) {
  const remotePath =
    typeof newRemote.path === 'string' ? newRemote.path : undefined

  doc.remote = _.defaultsDeep(
    _.cloneDeep(newRemote),
    {
      path: remotePath
        ? remotePath.startsWith('/')
          ? remotePath.substring(1)
          : remotePath
        : newRemote.trashed
        ? path.posix.join(TRASH_DIR_ID, newRemote.name)
        : path.posix.join(...doc.path.split(path.sep))
    },
    _.cloneDeep(doc.remote)
  )
}
