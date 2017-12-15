/* @flow */

import path, { sep } from 'path'

type SingleCharString = string

type PathRestrictions = {
  pathMaxBytes: number,
  nameMaxBytes: number,
  dirNameMaxBytes: ?number,
  reservedChars: Set<SingleCharString>,
  reservedCharsRegExp: RegExp,
  forbiddenLastChars: Set<SingleCharString>,
  reservedNames: Set<string>
}

export type ReservedCharsIssue = {| type: 'reservedChars', name: string, platform: string, reservedChars?: Set<SingleCharString> |}
export type ReservedNameIssue = {| type: 'reservedName', name: string, platform: string, reservedName?: string |}
export type ForbiddenLastCharIssue = {| type: 'forbiddenLastChar', name: string, platform: string, forbiddenLastChar?: SingleCharString |}
export type NameMaxBytesIssue = {| type: 'nameMaxBytes', name: string, platform: string, nameMaxBytes: number |}
export type DirNameMaxBytesIssue = {| type: 'dirNameMaxBytes', name: string, platform: string, dirNameMaxBytes: number |}

// Describes a file/dir name issue so one could describe it in a user-friendly
// way: "File X cannot be saved on platform Y because it contains character Z"
type NameIssue =
  | ReservedCharsIssue
  | ReservedNameIssue
  | ForbiddenLastCharIssue
  | NameMaxBytesIssue
  | DirNameMaxBytesIssue

export type PathLengthIssue = {
  path: string,
  pathBytes?: number,
  pathMaxBytes?: number,
  platform: string
}

export type PathIssue =
  | (NameIssue & {path: string})
  | PathLengthIssue

function pathRestrictions (customs: Object): PathRestrictions {
  const reservedChars = customs.reservedChars || new Set()
  return Object.assign({
    dirNameMaxBytes: customs.dirNameMaxBytes || customs.nameMaxBytes,
    reservedChars,
    reservedCharsRegExp: new RegExp('[' +
      Array.from(reservedChars).join('')
        // Escape chars that would be interpreted by the RegExp
        .replace('\\', '\\\\') +
      ']', 'g'
    ),
    forbiddenLastChars: new Set(),
    reservedNames: new Set()
  }, customs)
}

// See: https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx
const win = pathRestrictions({
  pathMaxBytes: 259, // MAX_PATH without nul
  nameMaxBytes: 256, // pathMaxBytes without drive (ex: 'C:\')
  dirNameMaxBytes: 243, // nameMaxBytes without an 8.3 filename + separator
  reservedChars: new Set('<>:"/\\|?*'),
  forbiddenLastChars: new Set('. '),
  reservedNames: new Set([
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
  ])
})

// See: /usr/include/sys/syslimits.h
const mac = pathRestrictions({
  pathMaxBytes: 1023, // PATH_MAX without nul
  nameMaxBytes: 255, // NAME_MAX
  reservedChars: new Set('/:') // macOS API forbids colons for legacy reasons
})

// See: /usr/include/linux/limits.h
const linux = pathRestrictions({
  pathMaxBytes: 4095, // PATH_MAX without nul
  nameMaxBytes: 255, // NAME_MAX
  reservedChars: new Set('/')
})

export default { win, mac, linux }

function restrictionsByPlatform (platform: string) {
  switch (platform) {
    case 'win32': return win
    case 'darwin': return mac
    case 'linux': return linux
    default: throw new Error(`Unsupported platform: ${platform}`)
  }
}

function detectReservedChars (name: string, restrictions: PathRestrictions): ?Array<string> {
  return name.match(restrictions.reservedCharsRegExp)
}

function detectForbiddenLastChar (name: string, restrictions: PathRestrictions): ?string {
  const lastChar = name.slice(-1)
  if (restrictions.forbiddenLastChars.has(lastChar)) return lastChar
}

function detectReservedName (name: string, restrictions: PathRestrictions): ?string {
  const upperCaseName = name.toUpperCase()
  const upperCaseBasename = path.basename(upperCaseName, path.extname(upperCaseName))
  if (restrictions.reservedNames.has(upperCaseBasename)) {
    return upperCaseBasename
  }
}

function detectNameLengthIssue (name: string, restrictions: PathRestrictions): ?number {
  const { nameMaxBytes } = restrictions
  const nameBytes = Buffer.byteLength(name) // TODO: utf16?
  if (nameBytes > nameMaxBytes) {
    return nameMaxBytes
  }
}

function detectDirNameLengthIssue (name: string, restrictions: PathRestrictions): ?number {
  const { dirNameMaxBytes } = restrictions
  if (dirNameMaxBytes == null) return detectNameLengthIssue(name, restrictions)
  // TODO: utf16?
  if (Buffer.byteLength(name) > dirNameMaxBytes) return dirNameMaxBytes
}

// Identifies file/dir name issues that will prevent local synchronization
export function detectNameIssues (name: string, type: string, platform: string): NameIssue[] {
  const restrictions = restrictionsByPlatform(platform)
  const issues = []

  const reservedChars = detectReservedChars(name, restrictions)
  if (reservedChars) {
    issues.push({type: 'reservedChars', name, platform, reservedChars: new Set(reservedChars)})
  }

  const reservedName = detectReservedName(name, restrictions)
  if (reservedName) {
    issues.push({type: 'reservedName', name, platform, reservedName})
  }

  const forbiddenLastChar = detectForbiddenLastChar(name, restrictions)
  if (forbiddenLastChar) {
    issues.push({type: 'forbiddenLastChar', name, platform, forbiddenLastChar})
  }

  if (type === 'folder') {
    const dirNameMaxBytes = detectDirNameLengthIssue(name, restrictions)
    if (dirNameMaxBytes) {
      issues.push({type: 'dirNameMaxBytes', name, platform, dirNameMaxBytes})
    }
  } else if (type === 'file') {
    const nameMaxBytes = detectNameLengthIssue(name, restrictions)
    if (nameMaxBytes) {
      issues.push({type: 'nameMaxBytes', name, platform, nameMaxBytes})
    }
  }

  return issues
}

// Identifies issues in every path item that will prevent local synchronization
export function detectPathIssues (path: string, type: string): Array<PathIssue> {
  const platform = process.platform
  const ancestorNames = path.split(sep)
  const basename = ancestorNames.pop()

  const pathIssues = detectNameIssues(basename, type, platform)
    .map(nameIssue => ({...nameIssue, path}))

  const recursivePathIssues = ancestorNames
    .reduceRight((previousIssues, name, index, pathComponents) => {
      const path = pathComponents.slice(0, index + 1).join(sep)
      const nameIssues = detectNameIssues(name, 'folder', platform)

      return previousIssues.concat(
        nameIssues.map(issue => ({
          ...issue,
          path
        })
      ))
    }, pathIssues)

  return recursivePathIssues.filter(issue => issue != null)
}

export function detectPathLengthIssue (path: string, platform: string): ?PathLengthIssue {
  const { pathMaxBytes } = restrictionsByPlatform(platform)
  const pathBytes = Buffer.byteLength(path) // TODO: utf16?
  if (pathBytes > pathMaxBytes) {
    // FIXME: The name is useless, but could not find a way to make flow happy
    // without it.
    return {name: path, path, pathBytes, pathMaxBytes, platform}
  }
}
