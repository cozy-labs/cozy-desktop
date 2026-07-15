const sinon = require('sinon')

const WindowManager = require('../../../gui/js/window_manager')

describe('window_manager', () => {
  describe('focus', () => {
    const sandbox = sinon.createSandbox()
    let windowManager
    let win

    beforeEach(() => {
      win = {
        isMinimized: sandbox.stub(),
        restore: sandbox.spy(),
        focus: sandbox.spy()
      }
      windowManager = Object.create(WindowManager.prototype)
      windowManager.win = win
    })

    afterEach(() => sandbox.restore())

    it('does nothing when the window is closed', () => {
      windowManager.win = null

      windowManager.focus()
    })

    it('focuses an existing window', () => {
      win.isMinimized.returns(false)

      windowManager.focus()

      sinon.assert.notCalled(win.restore)
      sinon.assert.calledOnce(win.focus)
    })

    it('restores a minimized window before focusing it', () => {
      win.isMinimized.returns(true)

      windowManager.focus()

      sinon.assert.callOrder(win.restore, win.focus)
      sinon.assert.calledOnce(win.restore)
      sinon.assert.calledOnce(win.focus)
    })
  })
})
