/* @flow */

import clone from 'lodash.clone'
import isEqual from 'lodash.isequal'
import pick from 'lodash.pick'
import path, { sep } from 'path'

import logger from './logger'
import { sameDate } from './timestamp'
import * as regexp from './utils/regexp'

const log = logger({
  component: 'Metadata'
})

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
  _rev: string,
  md5sum?: string,
  class?: string,
  docType: string,
  errors: number,
  executable?: true,
  updated_at: string|Date,
  mime?: string,
  moveTo?: string, // Destination id
  path: string,
  remote: MetadataRemoteInfo,
  size?: number,
  tags: string[],
  sides: MetadataSidesInfo,
  trashed?: true
}

export let buildId: (doc: Metadata) => void = (_) => {}

switch (process.platform) {
  case 'linux': case 'freebsd': case 'sunos':
    buildId = buildIdUnix
    break
  case 'darwin':
    buildId = buildIdHFS
    break
  case 'win32':
    buildId = buildIdNTFS
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

// Build an _id from the path for Windows (NTFS file system)
function buildIdNTFS (doc: Metadata) {
  doc._id = doc.path.toUpperCase()
}

// Return true if the document has not a valid path
// (ie a path inside the mount point)
export function invalidPath (doc: Metadata) {
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

export function ensureValidPath (doc: Metadata) {
  if (invalidPath(doc)) {
    log.warn(`Invalid path: ${JSON.stringify(doc, null, 2)}`)
    throw new Error('Invalid path')
  }
}

// See: https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx
export const WINDOWS_RESERVED_CHARS = new Set('<>:"/\\|?*')
export const WINDOWS_FORBIDDEN_LAST_CHARS = new Set('. ')
export const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
])
export const POSIX_RESERVED_CHARS = new Set('/')
export const MACOS_RESERVED_CHARS = new Set('/:')

const WINDOWS_RESERVED_CHARS_REGEXP = regexp.charsFinder(WINDOWS_RESERVED_CHARS)
const POSIX_RESERVED_CHARS_REGEXP = regexp.charsFinder(POSIX_RESERVED_CHARS)
const MACOS_RESERVED_CHARS_REGEXP = regexp.charsFinder(MACOS_RESERVED_CHARS)

// Picks the appropriate reserved chars regexp according to the given platform
function reservedCharsRegExp (platform: string): RegExp {
  switch (platform) {
    case 'darwin': return MACOS_RESERVED_CHARS_REGEXP
    case 'win32': return WINDOWS_RESERVED_CHARS_REGEXP
    default: return POSIX_RESERVED_CHARS_REGEXP
  }
}

// Returns any matching forbidden last char for the given platform
function matchingForbiddenLastChar (name: string, platform: string): ?string {
  const lastChar = name.slice(-1)
  if (platform === 'win32' &&
      WINDOWS_FORBIDDEN_LAST_CHARS.has(lastChar)) {
    return lastChar
  }
}

// Picks the appropriate reserved names set according to the given platform
function reservedNames (platform: string): Set<string> {
  switch (platform) {
    case 'win32': return WINDOWS_RESERVED_NAMES
    default: return new Set()
  }
}

// Returns any matching reserved name for the given platform.
function matchingReservedName (name: string, platform: string): ?string {
  const upperCaseName = name.toUpperCase()
  const upperCaseBasename = path.basename(upperCaseName, path.extname(upperCaseName))
  if (reservedNames(platform).has(upperCaseBasename)) {
    return upperCaseBasename
  }
}

// Describes a file/dir name issue so one could describe it in a user-friendly
// way: "File X cannot be saved on platform Y because it contains character Z"
type NamePlatformIncompatibilities = {
  name: string,
  docType?: string,
  reservedChars?: Set<string>,
  reservedName?: string,
  forbiddenLastChar?: string,
  platform: string
}

// Identifies file/dir name issues that will prevent local synchronization
export function namePlatformIncompatibilities (args: {name: string,
                                                      docType: string},
                                               platform: string): ?NamePlatformIncompatibilities {
  const {name} = args
  const incompatibilities = {...args, platform}

  const reservedChars = name.match(reservedCharsRegExp(platform))
  if (reservedChars) {
    incompatibilities.reservedChars = new Set(reservedChars)
  }

  const reservedName = matchingReservedName(name, platform)
  if (reservedName) {
    incompatibilities.reservedName = reservedName
  }

  const forbiddenLastChar = matchingForbiddenLastChar(name, platform)
  if (forbiddenLastChar) {
    incompatibilities.forbiddenLastChar = forbiddenLastChar
  }

  if (incompatibilities.reservedChars ||
      incompatibilities.reservedName ||
      incompatibilities.forbiddenLastChar) {
    return incompatibilities
  } else {
    return null
  }
}

// Identifies issues in every path item that will prevent local synchronization
export function pathPlatformIncompatibilities (metadata: Metadata): * {
  const platform = process.platform
  const {path, docType} = metadata
  const ancestorNames = path.split(sep)
  const childName = ancestorNames.pop()
  const incompatibilities = ancestorNames
    .map(name => namePlatformIncompatibilities(
      {name, docType: 'folder'},
      platform
    ))
    .concat([namePlatformIncompatibilities(
      {name: childName, docType},
      platform
    )])
    .filter(incompatibility => (
      incompatibility != null && incompatibility.name
    ))
  if (incompatibilities.length === 0) return null
  return incompatibilities
}

// Return true if the checksum is invalid
// If the checksum is missing, it is not invalid, just missing,
// so it returns false.
// MD5 has 16 bytes.
// Base64 encoding must include padding.
export function invalidChecksum (doc: Metadata) {
  if (doc.md5sum == null) return false

  const buffer = Buffer.from(doc.md5sum, 'base64')

  return buffer.byteLength !== 16 ||
    buffer.toString('base64') !== doc.md5sum
}

export function ensureValidChecksum (doc: Metadata) {
  if (invalidChecksum(doc)) {
    log.warn(`Invalid checksum: ${JSON.stringify(doc, null, 2)}`)
    throw new Error('Invalid checksum')
  }
}

// Extract the revision number, or 0 it not found
export function extractRevNumber (infos: Metadata) {
  try {
    let rev = infos._rev.split('-')[0]
    return Number(rev)
  } catch (error) {
    return 0
  }
}

// Return true if the remote file is up-to-date for this document
export function isUpToDate (side: SideName, doc: Metadata) {
  let currentRev = doc.sides[side] || 0
  let lastRev = extractRevNumber(doc)
  return currentRev === lastRev
}

// Return true if the metadata of the two folders are the same
// For updated_at, we accept up to 3s of differences because we can't
// rely on file systems to be precise to the millisecond.
export function sameFolder (one: Metadata, two: Metadata) {
  if (!sameDate(one.updated_at, two.updated_at)) {
    log.debug({diff: {one, two}})
    return false
  }
  let fields = ['_id', 'docType', 'remote', 'tags', 'trashed']
  one = pick(one, fields)
  two = pick(two, fields)
  const same = isEqual(one, two)
  if (!same) log.debug({diff: {one, two}})
  return same
}

// Return true if the metadata of the two files are the same
// For updated_at, we accept up to 3s of differences because we can't
// rely on file systems to be precise to the millisecond.
export function sameFile (one: Metadata, two: Metadata) {
  if (!sameDate(one.updated_at, two.updated_at)) {
    log.debug({diff: {one, two}})
    return false
  }
  let fields = ['_id', 'docType', 'md5sum', 'remote', 'tags', 'size', 'trashed']
  one = {...pick(one, fields), executable: !!one.executable}
  two = {...pick(two, fields), executable: !!two.executable}
  const same = isEqual(one, two)
  if (!same) log.debug({diff: {one, two}})
  return same
}

// Return true if the two files have the same binary content
export function sameBinary (one: Metadata, two: Metadata) {
  return one.md5sum === two.md5sum
}

// Mark the next rev for this side
//
// To track which side has made which modification, a revision number is
// associated to each side. When a side make a modification, we extract the
// revision from the previous state, increment it by one to have the next
// revision and associate this number to the side that makes the
// modification.
export function markSide (side: string, doc: Metadata, prev: ?Metadata): Metadata {
  let rev = 0
  if (prev) { rev = extractRevNumber(prev) }
  if (doc.sides == null) {
    const was = prev && prev.sides
    doc.sides = clone(was || {})
  }
  doc.sides[side] = ++rev
  return doc
}
