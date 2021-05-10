/** Incompatibilities specific to the current platform.
 *
 * @module core/incompatibilities/platform
 * @flow
 */

const path = require('path')
const { sep } = path

const _ = require('lodash')

/*::
import type { Incompatibility, SavedMetadata } from '../metadata'

type SingleCharString = string

type PlatformRestrictions = {
  pathMaxBytes: number,
  nameMaxBytes: number,
  dirNameMaxBytes: ?number,
  reservedChars: Set<SingleCharString>,
  reservedCharsRegExp: RegExp,
  forbiddenLastChars: Set<SingleCharString>,
  reservedNames: Set<string>
}

export type ReservedCharsIncompatibility = {|
  type: 'reservedChars',
  name: string,
  platform: string,
  reservedChars?: Set<SingleCharString>
|}
export type ReservedNameIncompatibility = {|
  type: 'reservedName',
  name: string,
  platform: string,
  reservedName?: string
|}
export type ForbiddenLastCharIncompatibility = {|
  type: 'forbiddenLastChar',
  name: string,
  platform: string,
  forbiddenLastChar?: SingleCharString
|}
export type NameMaxBytesIncompatibility = {|
  type: 'nameMaxBytes',
  name: string,
  platform: string,
  nameMaxBytes: number
|}
export type DirNameMaxBytesIncompatibility = {|
  type: 'dirNameMaxBytes',
  name: string,
  platform: string,
  dirNameMaxBytes: number
|}

// Describes a file/dir name issue so one could describe it in a user-friendly
// way: "File X cannot be saved on platform Y because it contains character Z"
type NameIncompatibility =
  | ReservedCharsIncompatibility
  | ReservedNameIncompatibility
  | ForbiddenLastCharIncompatibility
  | NameMaxBytesIncompatibility
  | DirNameMaxBytesIncompatibility

type PathIncompatibility = { ...NameIncompatibility, path: string }

export type PathLengthIncompatibility = {|
  type: 'pathMaxBytes',
  path: string,
  pathBytes: number,
  pathMaxBytes: number,
  platform: string
|}

export type PlatformIncompatibility =
  | PathIncompatibility
  | PathLengthIncompatibility
*/

const platformRestrictions = (
  customs /*: Object */
) /*: PlatformRestrictions */ => {
  const reservedChars = customs.reservedChars || new Set()
  return Object.assign(
    {
      dirNameMaxBytes: customs.dirNameMaxBytes || customs.nameMaxBytes,
      reservedChars,
      reservedCharsRegExp: new RegExp(
        '[' +
          Array.from(reservedChars)
            .join('')
            // Escape chars that would be interpreted by the RegExp
            .replace('\\', '\\\\') +
          ']',
        'g'
      ),
      forbiddenLastChars: new Set(),
      reservedNames: new Set()
    },
    customs
  )
}

/** Windows-specific restrictions.
 *
 * @see https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx
 */
const win = platformRestrictions({
  pathMaxBytes: 32766, // long paths MAX_PATH without nul
  nameMaxBytes: 256, // short paths MAX_PATH without drive (ex: 'C:\')
  dirNameMaxBytes: 243, // nameMaxBytes without an 8.3 filename + separator
  reservedChars: new Set('<>:"/\\|?*'),
  forbiddenLastChars: new Set('. '),
  reservedNames: new Set([
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'COM2',
    'COM3',
    'COM4',
    'COM5',
    'COM6',
    'COM7',
    'COM8',
    'COM9',
    'LPT1',
    'LPT2',
    'LPT3',
    'LPT4',
    'LPT5',
    'LPT6',
    'LPT7',
    'LPT8',
    'LPT9'
  ])
})

/** macOS-specific restrictions.
 *
 * @see /usr/include/sys/syslimits.h
 */
const mac = platformRestrictions({
  pathMaxBytes: 1023, // PATH_MAX without nul
  nameMaxBytes: 255, // NAME_MAX
  reservedChars: new Set('/')
})

/** GNU/Linux-specific restrictions.
 *
 * @see /usr/include/linux/limits.h
 */
const linux = platformRestrictions({
  pathMaxBytes: 4095, // PATH_MAX without nul
  nameMaxBytes: 255, // NAME_MAX
  reservedChars: new Set('/')
})

const restrictionsByPlatform = (platform /*: string */) => {
  switch (platform) {
    case 'win32':
      return win
    case 'darwin':
      return mac
    case 'linux':
      return linux
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}

const detectReservedChars = (
  name /*: string */,
  restrictions /*: PlatformRestrictions */
) /*: ?Array<string> */ => {
  return name.match(restrictions.reservedCharsRegExp)
}

const detectForbiddenLastChar = (
  name /*: string */,
  restrictions /*: PlatformRestrictions */
) /*: ?string */ => {
  const lastChar = name.slice(-1)
  if (restrictions.forbiddenLastChars.has(lastChar)) return lastChar
}

const detectReservedName = (
  name /*: string */,
  restrictions /*: PlatformRestrictions */
) /*: ?string */ => {
  const upperCaseName = name.toUpperCase()
  const upperCaseBasename = path.basename(
    upperCaseName,
    path.extname(upperCaseName)
  )
  if (restrictions.reservedNames.has(upperCaseBasename)) {
    return upperCaseBasename
  }
}

const detectNameLengthIncompatibility = (
  name /*: string */,
  restrictions /*: PlatformRestrictions */
) /*: ?number */ => {
  const { nameMaxBytes } = restrictions
  const nameBytes = Buffer.byteLength(name) // TODO: utf16?
  if (nameBytes > nameMaxBytes) {
    return nameMaxBytes
  }
}

const detectDirNameLengthIncompatibility = (
  name /*: string */,
  restrictions /*: PlatformRestrictions */
) /*: ?number */ => {
  const { dirNameMaxBytes } = restrictions
  if (dirNameMaxBytes == null) {
    return detectNameLengthIncompatibility(name, restrictions)
  }
  // TODO: utf16?
  if (Buffer.byteLength(name) > dirNameMaxBytes) return dirNameMaxBytes
}

/** Detect whether the file/dir name is incompatible with the current platform
 * and will prevent local synchronization.
 */
const detectNameIncompatibilities = (
  name /*: string */,
  type /*: string */,
  platform /*: string */
) /*: NameIncompatibility[] */ => {
  const restrictions = restrictionsByPlatform(platform)
  const issues = []

  const reservedChars = detectReservedChars(name, restrictions)
  if (reservedChars) {
    issues.push({
      type: 'reservedChars',
      name,
      platform,
      reservedChars: new Set(reservedChars)
    })
  }

  const reservedName = detectReservedName(name, restrictions)
  if (reservedName) {
    issues.push({ type: 'reservedName', name, platform, reservedName })
  }

  const forbiddenLastChar = detectForbiddenLastChar(name, restrictions)
  if (forbiddenLastChar) {
    issues.push({
      type: 'forbiddenLastChar',
      name,
      platform,
      forbiddenLastChar
    })
  }

  if (type === 'folder') {
    const dirNameMaxBytes = detectDirNameLengthIncompatibility(
      name,
      restrictions
    )
    if (dirNameMaxBytes) {
      issues.push({ type: 'dirNameMaxBytes', name, platform, dirNameMaxBytes })
    }
  } else if (type === 'file') {
    const nameMaxBytes = detectNameLengthIncompatibility(name, restrictions)
    if (nameMaxBytes) {
      issues.push({ type: 'nameMaxBytes', name, platform, nameMaxBytes })
    }
  }

  return issues
}

/** Detect parts of the path that are incompatible with the current platform
 * and will prevent local synchronization.
 */
const detectPathIncompatibilities = (
  path /*: string */,
  type /*: string */
) /*: Array<PlatformIncompatibility> */ => {
  const platform = process.platform
  const ancestorNames = path.split(sep)
  const basename = ancestorNames.pop()

  const pathIncompatibilities = detectNameIncompatibilities(
    basename,
    type,
    platform
  ).map(nameIncompatibility => _.merge({ path }, nameIncompatibility))

  const recursivePathIncompatibilities = ancestorNames.reduceRight(
    (previousIncompatibilities, name, index, pathComponents) => {
      const path = pathComponents.slice(0, index + 1).join(sep)
      const nameIncompatibilities = detectNameIncompatibilities(
        name,
        'folder',
        platform
      )

      return previousIncompatibilities.concat(
        nameIncompatibilities.map(issue => _.merge({ path }, issue))
      )
    },
    pathIncompatibilities
  )

  return recursivePathIncompatibilities.filter(issue => issue != null)
}

/** Detect whether the given absolute path is too long for the current platform
 * and will prevent local synchronization.
 */
const detectPathLengthIncompatibility = (
  path /*: string */,
  platform /*: string */
) /*: ?PathLengthIncompatibility */ => {
  const { pathMaxBytes } = restrictionsByPlatform(platform)
  const pathBytes = Buffer.byteLength(path) // TODO: utf16?
  if (pathBytes > pathMaxBytes) {
    return { type: 'pathMaxBytes', path, pathBytes, pathMaxBytes, platform }
  }
}

class IncompatibleDocError extends Error {
  /*::
  doc: SavedMetadata
  incompatibilities: ?Incompatibility[]
  */

  constructor({ doc } /*: { doc: SavedMetadata } */) {
    super('Document is incompatible with local platform')

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, IncompatibleDocError)
    }

    this.name = 'IncompatibleDocError'
    this.doc = doc
    this.incompatibilities = this.doc.incompatibilities
  }
}

module.exports = {
  win,
  mac,
  linux,
  detectNameIncompatibilities,
  detectPathIncompatibilities,
  detectPathLengthIncompatibility,
  IncompatibleDocError
}
