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
        onboardingWindow.sendSyncConfig
      )
      sinon.assert.calledWithExactly(
        onboardingWindow.desktop.registerWithDelegationCode,
        'example.mycozy.cloud',
        'delegation-code'
      )
      sinon.assert.calledOnce(onboardingWindow.sendSyncConfig)
    })
  })
})
