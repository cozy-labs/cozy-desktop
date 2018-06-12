/* eslint-env mocha */
/* @flow */

import type { Warning } from '../../../core/remote/warning'

const should = require('should')
const sinon = require('sinon')

const {
  POLLING_DELAY,
  RemoteWarningPoller
} = require('../../../core/remote/warning_poller')

const warningBuilders = require('../../support/builders/remote/warning')

describe('RemoteWarningPoller', () => {
  let clock, events, poller, remoteCozy

  beforeEach(() => {
    clock = sinon.useFakeTimers()
    remoteCozy = {warnings: sinon.stub().resolves([])}
    events = {emit: sinon.spy()}
    // $FlowFixMe
    poller = new RemoteWarningPoller(remoteCozy, events)
  })

  afterEach(() => {
    clock.restore()
  })

  describe('#poll()', () => {
    it('emits warnings if any', async () => {
      const warnings: Warning[] = warningBuilders.list()
      remoteCozy.warnings.resolves(warnings)
      await poller.poll()
      should(events.emit).have.been.calledOnce()
      should(events.emit).have.been.calledWith('remoteWarnings', warnings)
    })

    it('emits nothing when no warnings', async () => {
      await poller.poll()
      should(events.emit).not.have.been.called()
    })
  })

  describe('#start()', () => {
    it('polls continuously according to POLLING_DELAY', async () => {
      const warnings: Warning[] = warningBuilders.list()
      remoteCozy.warnings.onSecondCall().resolves(warnings)

      poller.start()
      clock.tick(POLLING_DELAY)
      await poller.currentPolling

      should(remoteCozy.warnings).have.been.calledTwice()
      should(events.emit).have.been.calledOnce()
      should(events.emit).have.been.calledWith('remoteWarnings', warnings)
    })
  })

  describe('#stop()', () => {
    beforeEach(async () => {
      poller.start()
      await poller.stop()
    })

    it('waits for current polling to complete if any', () => {
      should.not.exist(poller.currentPolling)
    })

    it('cancels upcoming pollings', () => {
      const warnings = warningBuilders.list()
      remoteCozy.warnings.onSecondCall().resolves(warnings)
      clock.tick(POLLING_DELAY)
      should(remoteCozy.warnings).have.been.calledOnce()
      should(events.emit).not.have.been.called()
    })
  })
})
