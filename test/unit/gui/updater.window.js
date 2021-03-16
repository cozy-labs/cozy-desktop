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
})
