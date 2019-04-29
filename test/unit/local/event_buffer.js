/* eslint-env mocha */
/* @flow */

const should = require('should')
const sinon = require('sinon')

const LocalEventBuffer = require('../../../core/local/event_buffer')

describe('EventBuffer', () => {
  const TIMEOUT_IN_MS = 2000
  let buffer, clock, flushed

  beforeEach(() => {
    clock = sinon.useFakeTimers()
    flushed = sinon.spy()
    buffer = new LocalEventBuffer(TIMEOUT_IN_MS, flushed)
  })

  afterEach(() => {
    buffer.clearTimeout()
    clock.restore()
  })

  it('is empty by default', () => {
    should(buffer.events).deepEqual([])
  })

  const event1 = { path: 'path/1' }
  const event2 = { path: 'path/2' }

  context('in idle mode (default)', () => {
    beforeEach(() => {
      clock.tick(TIMEOUT_IN_MS)
      buffer.push(event1)
      clock.tick(TIMEOUT_IN_MS)
      buffer.push(event2)
      clock.tick(TIMEOUT_IN_MS)
    })

    it('stores all pushed events', () => {
      should(buffer.events).deepEqual([event1, event2])
    })

    it('never flushes automatically', () => {
      should(flushed).not.have.been.called()
    })

    it('can be flushed manually', () => {
      buffer.flush()
      should(flushed).have.been.calledWith([event1, event2])
    })

    it('can be switched to timeout mode', () => {
      buffer.switchMode('timeout')
      should(flushed).have.been.calledWith([event1, event2])
    })
  })

  context('in timeout mode', () => {
    beforeEach(() => {
      buffer.switchMode('timeout')
    })

    it('can be switched back to idle mode, canceling timeout if any', () => {
      buffer.push(event1)
      buffer.switchMode('idle')
      clock.tick(TIMEOUT_IN_MS)
      should(flushed).have.been.calledWith([event1])
    })

    it('does not flush without events', () => {
      clock.tick(TIMEOUT_IN_MS)
      should(flushed).not.have.been.called()
    })

    context('when last event occured less than TIMEOUT_IN_MS ago', () => {
      beforeEach(() => {
        buffer.push(event1)
        clock.tick(TIMEOUT_IN_MS - 1)
        buffer.push(event2)
        clock.tick(TIMEOUT_IN_MS - 1)
      })

      it('does not flush', () => {
        should(flushed).not.have.been.called()
      })

      it('stores new events', () => {
        should(buffer.events).deepEqual([event1, event2])
      })
    })

    context(
      'when last event occured since or more than TIMEOUT_IN_MS ago',
      () => {
        const event3 = { path: 'path/3' }
        const event4 = { path: 'path/4' }

        beforeEach(() => {
          buffer.switchMode('timeout')
          buffer.push(event1)
          buffer.push(event2)
        })

        it('flushes on timeout', () => {
          clock.tick(TIMEOUT_IN_MS)
          buffer.push(event3)
          should(flushed).have.been.calledWith([event1, event2])

          clock.tick(TIMEOUT_IN_MS + 1)
          buffer.push(event4)
          should(flushed).have.been.calledWith([event3])
        })

        it('stores new events', () => {
          clock.tick(TIMEOUT_IN_MS)
          buffer.push(event3)
          should(buffer.events).deepEqual([event3])

          clock.tick(TIMEOUT_IN_MS + 1)
          buffer.push(event4)
          should(buffer.events).deepEqual([event4])
        })
      }
    )
  })
})
