const mocha = require('mocha')

module.exports = {
  onPlatforms,
  onPlatform
}

function onPlatforms (...platformsAndSpec) {
  const spec = platformsAndSpec.pop()
  const expectedPlatforms = platformsAndSpec
  const currentPlatform = process.platform

  const describe = expectedPlatforms.indexOf(currentPlatform) > -1
    ? mocha.describe
    : mocha.describe.skip

  describe(`on ${expectedPlatforms.join(' / ')}`, spec)
}

function onPlatform (platform, spec) {
  onPlatforms(platform, spec)
}
