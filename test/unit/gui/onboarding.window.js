const { session, shell } = require('electron')
const should = require('should')
const sinon = require('sinon')

const autoLaunch = require('../../../gui/js/autolaunch')
const i18n = require('../../../gui/js/i18n')
const OnboardingWM = require('../../../gui/js/onboarding.window')

describe('onboarding.window', () => {
  describe('handleOIDCCallback', () => {
    const sandbox = sinon.createSandbox()
    let onboardingWindow

    beforeEach(() => {
      onboardingWindow = Object.create(OnboardingWM.prototype)
      onboardingWindow.stealFocus = sandbox.spy()
      onboardingWindow.desktop = {
        registerWithDelegationCode: sandbox.stub().resolves()
      }
      onboardingWindow.sendSyncConfig = sandbox.stub().resolves()
      sandbox.stub(autoLaunch, 'setEnabled')
    })

    afterEach(() => sandbox.restore())

    it('focuses the window before registering the OAuth credentials', async () => {
      await onboardingWindow.handleOIDCCallback(
        'example.mycozy.cloud',
        'delegation-code',
        null
      )

      sinon.assert.callOrder(
        onboardingWindow.stealFocus,
        onboardingWindow.desktop.registerWithDelegationCode,
        onboardingWindow.sendSyncConfig,
        autoLaunch.setEnabled
      )
      sinon.assert.calledWithExactly(
        onboardingWindow.desktop.registerWithDelegationCode,
        'example.mycozy.cloud',
        'delegation-code',
        null,
        null
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

  describe('startOAuth', () => {
    const sandbox = sinon.createSandbox()
    let onboardingWindow

    beforeEach(() => {
      onboardingWindow = Object.create(OnboardingWM.prototype)
      onboardingWindow.stealFocus = sandbox.spy()
      onboardingWindow.desktop = {
        registerWithDelegationCode: sandbox.stub().resolves()
      }
      onboardingWindow.sendSyncConfig = sandbox.stub().resolves()
      sandbox.stub(autoLaunch, 'setEnabled')
      i18n.init({ getLocale: () => 'en' })
      sandbox.stub(shell, 'openExternal').resolves()
    })

    afterEach(() => sandbox.restore())

    const waitLoopbackListening = async () => {
      for (let i = 0; i < 500 && !shell.openExternal.called; i++) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      sinon.assert.calledOnce(shell.openExternal)
    }

    it('opens the browser on the loopback callback and registers', async () => {
      const event = { sender: { send: sandbox.spy() } }
      const promise = onboardingWindow.startOAuth(
        event,
        'https://manager.example/login'
      )
      await waitLoopbackListening()

      const opened = new URL(shell.openExternal.getCall(0).args[0])
      const callbackURL = opened.searchParams.get('redirect_after_oidc')
      should(callbackURL).match(
        /^http:\/\/127\.0\.0\.1:\d+\/callback\?state=[0-9a-f]{32}$/
      )

      const responseP = fetch(
        `${callbackURL}&fqdn=example.cozy.cloud&code=delegation-code`
      )
      await promise
      const response = await responseP
      should(response.status).equal(200)

      sinon.assert.callOrder(
        onboardingWindow.stealFocus,
        onboardingWindow.desktop.registerWithDelegationCode,
        onboardingWindow.sendSyncConfig
      )
      sinon.assert.calledWithExactly(
        onboardingWindow.desktop.registerWithDelegationCode,
        'example.cozy.cloud',
        'delegation-code',
        null,
        callbackURL
      )
      sinon.assert.calledOnce(onboardingWindow.sendSyncConfig)
      should(onboardingWindow.oidcWaiter).be.null()
    })

    it('answers 400 on a tampered state and still completes on a valid callback', async () => {
      const event = { sender: { send: sandbox.spy() } }
      const promise = onboardingWindow.startOAuth(
        event,
        'https://manager.example/login'
      )
      await waitLoopbackListening()

      const callbackURL = new URL(
        shell.openExternal.getCall(0).args[0]
      ).searchParams.get('redirect_after_oidc')

      const tamperedP = fetch(
        callbackURL.replace(/state=[0-9a-f]{32}/, 'state=tampered') +
          '&fqdn=example.cozy.cloud&code=delegation-code'
      )
      const tampered = await tamperedP
      should(tampered.status).equal(400)
      sinon.assert.notCalled(
        onboardingWindow.desktop.registerWithDelegationCode
      )

      const validP = fetch(
        `${callbackURL}&fqdn=example.cozy.cloud&code=delegation-code`
      )
      await promise
      const valid = await validP
      should(valid.status).equal(200)

      sinon.assert.notCalled(event.sender.send)
      sinon.assert.calledOnce(
        onboardingWindow.desktop.registerWithDelegationCode
      )
      sinon.assert.calledWithExactly(
        onboardingWindow.desktop.registerWithDelegationCode,
        'example.cozy.cloud',
        'delegation-code',
        null,
        callbackURL
      )
      should(onboardingWindow.oidcWaiter).be.null()
    })

    it('silently supersedes a running flow on restart', async () => {
      const firstEvent = { sender: { send: sandbox.spy() } }
      const secondEvent = { sender: { send: sandbox.spy() } }
      const first = onboardingWindow.startOAuth(
        firstEvent,
        'https://manager.example/login'
      )
      await waitLoopbackListening()
      const second = onboardingWindow.startOAuth(
        secondEvent,
        'https://manager.example/login'
      )
      for (let i = 0; i < 500 && shell.openExternal.callCount < 2; i++) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      sinon.assert.calledTwice(shell.openExternal)

      const callbackURL = new URL(
        shell.openExternal.getCall(1).args[0]
      ).searchParams.get('redirect_after_oidc')
      const responseP = fetch(
        `${callbackURL}&fqdn=example.cozy.cloud&code=delegation-code`
      )
      await first
      await second
      const response = await responseP
      should(response.status).equal(200)

      sinon.assert.notCalled(firstEvent.sender.send)
      sinon.assert.notCalled(secondEvent.sender.send)
      sinon.assert.calledOnce(
        onboardingWindow.desktop.registerWithDelegationCode
      )
      sinon.assert.calledWithExactly(
        onboardingWindow.desktop.registerWithDelegationCode,
        'example.cozy.cloud',
        'delegation-code',
        null,
        callbackURL
      )
      should(onboardingWindow.oidcWaiter).be.null()
    })
  })
})
