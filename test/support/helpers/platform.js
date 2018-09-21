/* @flow */

const mocha = require('mocha')

const macOSRelease = require('./MacOSRelease')

/*::
import type { MacOSReleaseInfo } from './MacOSRelease'
*/

const WINDOWS_DEFAULT_MODE = '666'

module.exports = {
  WINDOWS_DEFAULT_MODE,
  onMacOSAtLeast,
  onMacOSAtMost,
  onPlatforms,
  onPlatform
}

// Usage:
//
//     const MacOSRelease = require('.../MacOSRelease')
//     const { onMacOSAtLeast } = require('.../platform')
//     onMacOSAtLeast(MacOSRelease.HIGH_SIERRA_10_13, () => {
//       ...
//     })
//
function onMacOSAtLeast (minRelease /*: MacOSReleaseInfo */, spec /*: Function */) {
  const describe = macOSRelease.isAtLeast(minRelease)
    ? mocha.describe
    : mocha.describe.skip

  describe(`on ${macOSRelease.name(minRelease)} or higher`, spec)
}

// Usage:
//
//     const MacOSRelease = require('.../MacOSRelease')
//     const { onMacOSAtMost } = require('.../platform')
//     onMacOSAtMost(MacOSRelease.SIERRA_10_12, () => {
//       ...
//     })
//
function onMacOSAtMost (maxRelease /*: MacOSReleaseInfo */, spec /*: Function */) {
  const describe = macOSRelease.isAtMost(maxRelease)
    ? mocha.describe
    : mocha.describe.skip

  describe(`on ${macOSRelease.name(maxRelease)} or lower`, spec)
}

// $FlowFixMe
function onPlatforms (...platformsAndSpec) {
  const spec = platformsAndSpec.pop()
  const expectedPlatforms = platformsAndSpec
  const currentPlatform = process.platform

  const describe = expectedPlatforms.indexOf(currentPlatform) > -1
    ? mocha.describe
    : mocha.describe.skip

  describe(`on ${expectedPlatforms.join(' / ')}`, spec)
}

function onPlatform (platform /*: string */, spec /*: Function */) {
  onPlatforms(platform, spec)
}
