const should = require('should')
const sinon = require('sinon')

const { createAutoLauncher } = require('../../../gui/js/autolaunch')

describe('autolaunch', () => {
  const sandbox = sinon.createSandbox()
  let logger

  beforeEach(() => {
    logger = {
      debug: sandbox.spy(),
      error: sandbox.spy(),
      warn: sandbox.spy()
    }
  })

  afterEach(() => sandbox.restore())

  describe('macOS and Windows', () => {
    let electronApp

    beforeEach(() => {
      electronApp = {
        getLoginItemSettings: sandbox.stub(),
        setLoginItemSettings: sandbox.stub()
      }
    })

    it('reads the native login item status', async () => {
      electronApp.getLoginItemSettings.returns({
        openAtLogin: true,
        status: 'enabled'
      })
      const autoLauncher = createAutoLauncher({
        electronApp,
        logger,
        platform: 'darwin'
      })

      should(await autoLauncher.isEnabled()).be.true()

      sinon.assert.calledOnceWithExactly(electronApp.getLoginItemSettings)
      sinon.assert.notCalled(logger.warn)
    })

    it('logs when macOS requires user approval', async () => {
      electronApp.getLoginItemSettings.returns({
        openAtLogin: false,
        status: 'requires-approval'
      })
      const autoLauncher = createAutoLauncher({
        electronApp,
        logger,
        platform: 'darwin'
      })

      should(await autoLauncher.isEnabled()).be.false()

      sinon.assert.calledOnceWithExactly(
        logger.warn,
        'macOS autolaunch requires user approval'
      )
    })

    it('enables the native login item', async () => {
      electronApp.getLoginItemSettings.onFirstCall().returns({
        openAtLogin: false,
        status: 'not-registered'
      })
      electronApp.getLoginItemSettings.onSecondCall().returns({
        openAtLogin: true,
        status: 'enabled'
      })
      const autoLauncher = createAutoLauncher({
        electronApp,
        logger,
        platform: 'darwin'
      })

      should(await autoLauncher.setEnabled(true)).be.true()

      sinon.assert.calledOnceWithExactly(electronApp.setLoginItemSettings, {
        openAtLogin: true
      })
    })

    it('disables the native login item', async () => {
      electronApp.getLoginItemSettings.onFirstCall().returns({
        openAtLogin: true
      })
      electronApp.getLoginItemSettings.onSecondCall().returns({
        openAtLogin: false
      })
      const autoLauncher = createAutoLauncher({
        electronApp,
        logger,
        platform: 'win32'
      })

      should(await autoLauncher.setEnabled(false)).be.false()

      sinon.assert.calledOnceWithExactly(electronApp.setLoginItemSettings, {
        openAtLogin: false
      })
    })

    it('does not update an unchanged native login item', async () => {
      electronApp.getLoginItemSettings.returns({ openAtLogin: true })
      const autoLauncher = createAutoLauncher({
        electronApp,
        logger,
        platform: 'win32'
      })

      should(await autoLauncher.setEnabled(true)).be.true()

      sinon.assert.notCalled(electronApp.setLoginItemSettings)
    })

    it('returns false and logs native API errors', async () => {
      const err = new Error('could not read login item')
      electronApp.getLoginItemSettings.throws(err)
      const autoLauncher = createAutoLauncher({
        electronApp,
        logger,
        platform: 'darwin'
      })

      should(await autoLauncher.isEnabled()).be.false()

      sinon.assert.calledOnceWithExactly(
        logger.error,
        'could not check autolaunch status',
        { err }
      )
    })

    it('returns false and logs native update errors', async () => {
      const err = new Error('could not update login item')
      electronApp.getLoginItemSettings.returns({ openAtLogin: false })
      electronApp.setLoginItemSettings.throws(err)
      const autoLauncher = createAutoLauncher({
        electronApp,
        logger,
        platform: 'win32'
      })

      should(await autoLauncher.setEnabled(true)).be.false()

      sinon.assert.calledOnceWithExactly(
        logger.error,
        'could not set autolaunch',
        { err }
      )
    })
  })

  describe('Linux', () => {
    let autoLaunchBackend
    let AutoLaunchClass

    beforeEach(() => {
      autoLaunchBackend = {
        opts: { appName: 'Twake-Desktop-x86_64.AppImage' },
        disable: sandbox.stub().resolves(),
        enable: sandbox.stub().resolves(),
        isEnabled: sandbox.stub()
      }
      AutoLaunchClass = sandbox.stub().returns(autoLaunchBackend)
    })

    it('keeps the AppImage launcher name and path stable', async () => {
      autoLaunchBackend.isEnabled.onFirstCall().resolves(true)
      autoLaunchBackend.isEnabled.onSecondCall().resolves(true)

      const autoLauncher = createAutoLauncher({
        AutoLaunchClass,
        appImagePath: '/opt/Twake-Desktop.AppImage',
        logger,
        platform: 'linux'
      })

      should(await autoLauncher.isEnabled()).be.true()

      sinon.assert.calledOnceWithExactly(AutoLaunchClass, {
        name: 'Twake-Desktop',
        isHidden: true,
        path: '/opt/Twake-Desktop.AppImage'
      })
      should(autoLaunchBackend.opts.appName).equal('Twake-Desktop')
      sinon.assert.calledOnce(autoLaunchBackend.disable)
      sinon.assert.calledOnce(autoLaunchBackend.enable)
    })

    it('enables autolaunch through the Linux backend', async () => {
      autoLaunchBackend.isEnabled.resolves(false)
      const autoLauncher = createAutoLauncher({
        AutoLaunchClass,
        logger,
        platform: 'linux'
      })

      should(await autoLauncher.setEnabled(true)).be.true()

      sinon.assert.calledOnceWithExactly(AutoLaunchClass, {
        name: 'Twake-Desktop',
        isHidden: true
      })
      sinon.assert.calledOnce(autoLaunchBackend.enable)
      sinon.assert.notCalled(autoLaunchBackend.disable)
    })

    it('disables autolaunch through the Linux backend', async () => {
      autoLaunchBackend.isEnabled.resolves(true)
      const autoLauncher = createAutoLauncher({
        AutoLaunchClass,
        logger,
        platform: 'linux'
      })

      should(await autoLauncher.setEnabled(false)).be.false()

      sinon.assert.calledOnce(autoLaunchBackend.disable)
      sinon.assert.notCalled(autoLaunchBackend.enable)
    })

    it('returns false and logs Linux backend errors', async () => {
      const err = new Error('could not read desktop entry')
      autoLaunchBackend.isEnabled.rejects(err)
      const autoLauncher = createAutoLauncher({
        AutoLaunchClass,
        logger,
        platform: 'linux'
      })

      should(await autoLauncher.isEnabled()).be.false()

      sinon.assert.calledOnceWithExactly(
        logger.error,
        'could not check autolaunch status',
        { err }
      )
    })
  })
})
