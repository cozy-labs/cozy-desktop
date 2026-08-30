const { session } = require('electron')
const should = require('should')
const sinon = require('sinon')

const autoLaunch = require('../../../gui/js/autolaunch')
const OnboardingWM = require('../../../gui/js/onboarding.window')

describe('onboarding.window', () => {
  describe('handleDeepLink', () => {
    const sandbox = sinon.createSandbox()
    let onboardingWindow

    beforeEach(() => {
      onboardingWindow = Object.create(OnboardingWM.prototype)
      onboardingWindow.focus = sandbox.spy()
      onboardingWindow.desktop = {
        registerWithDelegationCode: sandbox.stub().resolves()
      }
      onboardingWindow.sendSyncConfig = sandbox.stub().resolves()
      sandbox.stub(autoLaunch, 'setEnabled')
    })

    afterEach(() => sandbox.restore())

    it('focuses the window before registering the OAuth credentials', async () => {
      await onboardingWindow.handleDeepLink(
        'cozy://?fqdn=example.mycozy.cloud&code=delegation-code'
      )

      sinon.assert.callOrder(
        onboardingWindow.focus,
        onboardingWindow.desktop.registerWithDelegationCode,
        onboardingWindow.sendSyncConfig,
        autoLaunch.setEnabled
      )
      sinon.assert.calledWithExactly(
        onboardingWindow.desktop.registerWithDelegationCode,
        'example.mycozy.cloud',
        'delegation-code'
      )
      sinon.assert.calledOnce(onboardingWindow.sendSyncConfig)
      sinon.assert.calledOnceWithExactly(autoLaunch.setEnabled, true)
    })
  })

  describe('onRegisterWithURL', () => {
    const sandbox = sinon.createSandbox()
    let event
    let onboardingWindow
    let syncSession

    beforeEach(() => {
      syncSession = {
        clearStorageData: sandbox.stub().resolves(),
        webRequest: {
          onBeforeRedirect: sandbox.stub(),
          onBeforeRequest: sandbox.stub()
        }
      }
      sandbox.stub(session, 'fromPartition').returns(syncSession)
      sandbox.stub(autoLaunch, 'setEnabled')

      onboardingWindow = Object.create(OnboardingWM.prototype)
      onboardingWindow.closeOAuthView = sandbox.spy()
      onboardingWindow.desktop = {
        checkCozyUrl: sandbox.stub().resolves('https://example.mycozy.cloud'),
        config: {},
        registerWithURL: sandbox.stub().resolves('file:///registered')
      }
      onboardingWindow.win = {
        loadURL: sandbox.spy(),
        webContents: { once: sandbox.spy() }
      }
      event = { sender: {} }
    })

    afterEach(() => sandbox.restore())

    it('enables autolaunch after registering with a Cozy URL', async () => {
      await onboardingWindow.onRegisterWithURL(event, {
        cozyUrl: 'example.mycozy.cloud',
        location: 'Paris'
      })

      should(onboardingWindow.desktop.config.cozyUrl).equal(
        'https://example.mycozy.cloud'
      )
      sinon.assert.calledWith(
        onboardingWindow.desktop.registerWithURL,
        'https://example.mycozy.cloud',
        'Paris',
        sinon.match.func
      )
      sinon.assert.callOrder(
        onboardingWindow.win.loadURL,
        onboardingWindow.closeOAuthView,
        autoLaunch.setEnabled
      )
      sinon.assert.calledOnceWithExactly(autoLaunch.setEnabled, true)
    })
  })
})
