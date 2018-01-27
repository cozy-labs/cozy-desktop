import mocha from 'mocha'

export function onPlatforms (...platformsAndSpec) {
  const spec = platformsAndSpec.pop()
  const platforms = platformsAndSpec

  if (platforms.indexOf(process.platform) > -1) {
    mocha.describe(`on ${platforms.join(' / ')}`, spec)
  }
}

export function onPlatform (platform, spec) {
  onPlatforms(platform, spec)
}
