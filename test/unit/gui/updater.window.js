const {
  GitHubProvider
} = require('electron-updater/out/providers/GitHubProvider')
const semver = require('semver')
const should = require('should')

const UpdaterWM = require('../../../gui/js/updater.window')

describe('updater.window', () => {
  describe('checkForUpdates', () => {
    it('resets the skipped property', async () => {
      const updater = new UpdaterWM()
      updater.skipped = true
      // We're not await here otherwise the error raised in test and dev
      // environments (i.e. missing update config file) would lead the
      // `UpdateWN` to call `skipUpdate()` and thus set `skipped` back to
      // `true`.
      updater.checkForUpdates()
      should(updater.skipped).be.false()
    })
  })

  describe('GitHub update metadata', () => {
    it('uses the ARM macOS channel file when configured', async () => {
      const requests = []
      const provider = new GitHubProvider(
        {
          owner: 'cozy-labs',
          repo: 'cozy-desktop',
          channel: 'latest-arm64'
        },
        {
          channel: null,
          allowPrerelease: false,
          currentVersion: semver.parse('5.4.0'),
          fullChangelog: false
        },
        {
          platform: 'darwin',
          executor: {
            request: async options => {
              requests.push(options.path)

              if (options.path.endsWith('.atom')) {
                return '<feed><entry><title>5.5.0</title><link href="https://github.com/cozy-labs/cozy-desktop/releases/tag/v5.5.0"/><content>No content.</content></entry></feed>'
              }

              if (options.path.endsWith('/latest')) {
                return JSON.stringify({ tag_name: 'v5.5.0' })
              }

              if (options.path.endsWith('.yml')) {
                return [
                  'version: 5.5.0',
                  'files:',
                  '  - url: Twake-Desktop-arm64.zip',
                  '    sha512: abc',
                  'path: Twake-Desktop-arm64.zip',
                  'sha512: abc'
                ].join('\n')
              }

              throw new Error(`Unexpected request: ${options.path}`)
            }
          }
        }
      )

      await provider.getLatestVersion()

      should(requests).containEql(
        '/cozy-labs/cozy-desktop/releases/download/v5.5.0/latest-arm64-mac.yml'
      )
      should(requests).not.containEql(
        '/cozy-labs/cozy-desktop/releases/download/v5.5.0/latest-mac.yml'
      )
    })
  })
})
