const should = require('should')

const UpdaterWM = require('../../../gui/js/updater.window')

describe('updater.window', () => {
  describe('checkForUpdates', () => {
    it('resets the skipped property', () => {
      const updater = new UpdaterWM()
      updater.skipped = true
      updater.checkForUpdates()
      should(updater.skipped).be.false()
    })
  })
})
