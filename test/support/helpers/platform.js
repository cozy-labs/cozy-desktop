const mocha = require('mocha')

module.exports = {
  onPlatforms,
  onPlatform
}

function onPlatforms (...platformsAndSpec) {
  const spec = platformsAndSpec.pop()
  const platforms = platformsAndSpec

  if (platforms.indexOf(process.platform) > -1) {
    mocha.describe(`on ${platforms.join(' / ')}`, spec)
  }
}

function onPlatform (platform, spec) {
  onPlatforms(platform, spec)
}
