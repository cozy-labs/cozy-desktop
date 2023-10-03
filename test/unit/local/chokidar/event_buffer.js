/* eslint-env mocha */
/* @flow */

const should = require('should')
const sinon = require('sinon')

const LocalEventBuffer = require('../../../../core/local/chokidar/event_buffer')
const { onPlatform } = require('../../../support/helpers/platform')

onPlatform('darwin', () => {
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

    describe('switchMode', () => {
      context('with buffered events', () => {
        beforeEach(() => {
          buffer.push(event1)
          buffer.push(event2)
        })

        context('from idle to timeout', () => {
          beforeEach(() => {
            buffer.mode = 'idle'
          })

          it('sets timeout', () => {
            buffer.switchMode('timeout')
            should(buffer).have.property('timeout')
          })
        })

        context('from timeout to idle', () => {
          beforeEach(() => {
            buffer.mode = 'timeout'
            buffer.setTimeout()
          })

          it('clears existing timeout', () => {
            clock.tick(TIMEOUT_IN_MS - 1)
            buffer.switchMode('idle')
            clock.tick(1)
            should(flushed).not.have.been.called()
          })

          it('does not set new timeout', () => {
            buffer.switchMode('idle')
            should(buffer).not.have.property('timeout')
          })
        })

        context('from timeout to timeout', () => {
          beforeEach(() => {
            buffer.mode = 'timeout'
            buffer.setTimeout()
          })

          it('clears existing timeout', () => {
            clock.tick(TIMEOUT_IN_MS - 1)
            buffer.switchMode('timeout')
            clock.tick(1)
            should(flushed).not.have.been.called()
          })

          it('sets new timeout', () => {
            buffer.switchMode('timeout')
            should(buffer).have.property('timeout')
          })
        })
      })

      context('without buffered events', () => {
        context('from idle to timeout', () => {
          beforeEach(() => {
            buffer.mode = 'idle'
          })

          it('does not set timeout', () => {
            buffer.switchMode('timeout')
            should(buffer).not.have.property('timeout')
          })
        })

        context('from timeout to timeout', () => {
          beforeEach(() => {
            buffer.mode = 'timeout'
          })

          it('does not set timeout', () => {
            buffer.switchMode('timeout')
            should(buffer).not.have.property('timeout')
          })
        })
      })
    })

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
    })

    context('in timeout mode', () => {
      beforeEach(() => {
        buffer.switchMode('timeout')
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
})
