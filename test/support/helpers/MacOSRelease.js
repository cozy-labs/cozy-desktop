/* @flow */

const os = require('os')

/*::
export opaque type MacOSReleaseInfo = {
  name: string,
  darwinMajor: number
}
*/

// https://en.wikipedia.org/wiki/Darwin_(operating_system)#Release_history
const HIGH_SIERRA_10_13 /*: MacOSReleaseInfo */ = {
  darwinMajor: 17,
  name: 'High Sierra 10.13'
}
const SIERRA_10_12 /*: MacOSReleaseInfo */ = {
  darwinMajor: 16,
  name: 'Sierra 10.12'
}

module.exports = {
  HIGH_SIERRA_10_13,
  SIERRA_10_12,
  isAtLeast,
  isAtMost,
  name
}

// Usage:
//
//     MacOSRelease.name(MacOSRelease.HIGH_SIERRA_10_13)
//
function name(release /*: MacOSReleaseInfo */) /*: string */ {
  return `macOS ${release.name}`
}

const isDarwin = process.platform === 'darwin'
const major = Number.parseInt(os.release().split('.')[0])

// Usage:
//
//     if (MacOSRelease.isAtLeast(MacOSRelease.HIGH_SIERRA_10_13) {
//       ...
//     }
//
function isAtLeast(minRelease /*: MacOSReleaseInfo */) /*: bool */ {
  if (!isDarwin) return false
  return major >= minRelease.darwinMajor
}

// Usage:
//
//     if (MacOSRelease.isAtMost(MacOSRelease.SIERRA_10_12) {
//       ...
//     }
//
function isAtMost(maxRelease /*: MacOSReleaseInfo */) /*: bool */ {
  if (!isDarwin) return false
  return major <= maxRelease.darwinMajor
}
