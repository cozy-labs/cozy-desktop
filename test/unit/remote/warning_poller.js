/* eslint-env mocha */
/* @flow */

const should = require('should')
const sinon = require('sinon')

const {
  DEFAULT_TICKS,
  MODE,
  TICKS,
  RemoteWarningPoller,
  shiftTicks,
  ticks
} = require('../../../core/remote/warning_poller')

const Builders = require('../../support/builders')

/*::
import type { Warning } from '../../../core/remote/warning'
*/

const builders = new Builders()

describe('remote/warning_poller', () => {
  describe('ticks', () => {
    it('can be a single one', () => {
      should(ticks(123)).deepEqual({ next: 123, rest: [] })
    })

    it('can be many', () => {
      should(ticks(1, 2, 3)).deepEqual({ next: 1, rest: [2, 3] })
    })
  })

  describe('shiftTicks', () => {
    it('shifts many ticks', () => {
      should(shiftTicks(ticks(1, 2, 3, 4))).deepEqual({ next: 2, rest: [3, 4] })
      should(shiftTicks(ticks(5, 6, 7))).deepEqual({ next: 6, rest: [7] })
      should(shiftTicks(ticks(8, 9))).deepEqual({ next: 9, rest: [] })
    })

    it('does not shift a single tick', () => {
      should(shiftTicks(ticks(42))).deepEqual({ next: 42, rest: [] })
    })
  })
})

describe('RemoteWarningPoller', () => {
  let clock, events, poller, remoteCozy

  beforeEach(() => {
    clock = sinon.useFakeTimers()
    remoteCozy = { warnings: sinon.stub().resolves([]) }
    events = { emit: sinon.spy() }
    // $FlowFixMe
    poller = new RemoteWarningPoller(remoteCozy, events)
  })

  afterEach(() => {
    clock.restore()
  })

  describe('#poll()', () => {
    it('emits warnings if any', async () => {
      const warnings /*: Warning[] */ = builders.remoteWarnings()
      remoteCozy.warnings.resolves(warnings)
      await poller.poll()
      should(events.emit).have.been.calledOnce()
      should(events.emit).have.been.calledWith('remoteWarnings', warnings)
    })

    it('emits empty list when no warnings', async () => {
      const noWarnings = []
      remoteCozy.warnings.resolves(noWarnings)
      await poller.poll()
      should(events.emit).have.been.calledOnce()
      should(events.emit).have.been.calledWith('remoteWarnings', noWarnings)
    })

    it('does not stop working on error', async () => {
      const err = new Error('whatever')
      remoteCozy.warnings.rejects(err)
      sinon.spy(poller, 'scheduleNext')
      await should(poller.poll()).not.be.rejected()
      should(poller.scheduleNext).have.been.calledOnce()
    })

    it('waits again for next tick when already polling', async () => {
      const currentTicks = { next: 1, rest: [2] }
      poller.ticks = currentTicks
      poller.polling = new Promise(() => {})
      sinon.spy(poller, 'scheduleNext')
      await poller.poll()
      should(remoteCozy.warnings).not.have.been.called()
      should(poller.scheduleNext).have.been.calledOnce()
      should(poller.scheduleNext).have.been.calledWith(currentTicks)
    })
  })

  describe('#start()', () => {
    // FIXME
    it.skip('polls continuously according to POLLING_DELAY', async () => {
      const noWarnings = []
      const warnings /*: Warning[] */ = builders.remoteWarnings()
      remoteCozy.warnings.onFirstCall().resolves(noWarnings)
      remoteCozy.warnings.onSecondCall().resolves(warnings)

      poller.start()
      clock.tick(DEFAULT_TICKS.next)
      await poller.polling

      should(remoteCozy.warnings).have.been.calledTwice()
      should(events.emit).have.been.calledTwice()
      should(events.emit).have.been.calledWith('remoteWarnings', noWarnings)
      should(events.emit).have.been.calledWith('remoteWarnings', warnings)
    })
  })

  describe('#stop()', () => {
    beforeEach(async () => {
      poller.start()
      await poller.stop()
    })

    it('waits for current polling to complete if any', () => {
      should.not.exist(poller.polling)
    })

    // FIXME
    it.skip('cancels upcoming pollings', () => {
      const warnings /*: Warning[] */ = builders.remoteWarnings()
      remoteCozy.warnings.onFirstCall().resolves([])
      remoteCozy.warnings.onSecondCall().resolves(warnings)
      clock.tick(DEFAULT_TICKS.next)
      should(remoteCozy.warnings).have.been.calledOnce()
      should(events.emit).have.been.calledOnce()
    })
  })

  describe('#scheduleNext()', () => {
    // FIXME
    it.skip('schedules the given next ticks', () => {
      const nextTicks = ticks(1, 2, 3)
      should(poller.ticks).not.deepEqual(nextTicks)

      poller.scheduleNext(nextTicks)
      should(poller.ticks).deepEqual(nextTicks)
      should(events.emit).not.have.been.called()

      clock.tick(nextTicks.next)
      should(events.emit).have.been.calledOnce()
    })

    // FIXME
    it.skip('cancels scheduled ticks & timeout if any', () => {
      poller.scheduleNext(ticks(1))
      poller.scheduleNext(ticks(3, 4))
      should(poller.ticks).deepEqual({ next: 3, rest: [4] })
      clock.tick(1)
      should(events.emit).not.have.been.called()
      clock.tick(3)
      should(events.emit).have.been.calledOnce()
    })
  })

  describe('#switchMode()', () => {
    it('schedules next ticks when faster', async () => {
      poller.switchMode('medium')
      should(poller.ticks).deepEqual(TICKS[MODE.MEDIUM])
      poller.switchMode('fast')
      should(poller.ticks).deepEqual(TICKS[MODE.FAST])
    })

    it('does nothing otherwise', async () => {
      poller.switchMode('medium')
      poller.switchMode('slow')
      should(poller.ticks).deepEqual(TICKS[MODE.MEDIUM])
      poller.switchMode('fast')
      poller.switchMode('medium')
      should(poller.ticks).deepEqual(TICKS[MODE.FAST])
      poller.switchMode('slow')
      should(poller.ticks).deepEqual(TICKS[MODE.FAST])
    })
  })
})
