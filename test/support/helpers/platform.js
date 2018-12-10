/* @flow */
/* eslint-env mocha */

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
  const describeOrSkip = macOSRelease.isAtLeast(minRelease)
    ? describe
    : describe.skip

  describeOrSkip(`on ${macOSRelease.name(minRelease)} or higher`, spec)
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
  const describeOrSkip = macOSRelease.isAtMost(maxRelease)
    ? describe
    : describe.skip

  describeOrSkip(`on ${macOSRelease.name(maxRelease)} or lower`, spec)
}

function onPlatforms (...platformsAndSpec /*: any[] */) {
  const spec /*: Function */ = platformsAndSpec.pop()
  const expectedPlatforms /*: string[] */ = platformsAndSpec
  const currentPlatform = process.platform

  const describeOrSkip = expectedPlatforms.indexOf(currentPlatform) > -1
    ? describe
    : describe.skip

  describeOrSkip(`on ${expectedPlatforms.join(' / ')}`, spec)
}

function onPlatform (platform /*: string */, spec /*: Function */) {
  onPlatforms(platform, spec)
}
