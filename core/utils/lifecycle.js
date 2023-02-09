/**
 * @module core/utils/lifecycle
 * @flow
 */

const EventEmitter = require('events')

/*::
import type { Logger } from './logger'

type State = 'done-stop' | 'will-start' | 'done-start' | 'will-stop'
*/

class LifeCycle extends EventEmitter {
  /*::
  currentState: State
  blockedFor: ?string
  log: Logger
  */

  constructor(logger /*: Logger */) {
    super()
    this.currentState = 'done-stop'
    this.blockedFor = null
    this.log = logger
  }

  canTransitionTo(state /*: State */) {
    return this.currentState !== state
  }

  transitionTo(newState /*: State */) {
    this.currentState = newState
    this.emit(newState)
    this.log.info(newState)
  }

  async transitionedTo(futureState /*: State */) {
    return new Promise(resolve => {
      if (this.currentState === futureState) resolve()
      else this.once(futureState, resolve)
    })
  }

  begin(endState /*: 'start' | 'stop' */) {
    switch (endState) {
      case 'start':
        if (this.canTransitionTo('will-start')) {
          this.transitionTo('will-start')
        } else {
          throw new Error(`Cannot begin ${endState}`)
        }
        break
      case 'stop':
        if (this.canTransitionTo('will-stop')) {
          this.transitionTo('will-stop')
        } else {
          throw new Error(`Cannot begin ${endState}`)
        }
        break
    }
  }

  end(endState /*: 'start' | 'stop' */) {
    switch (endState) {
      case 'start':
        if (this.currentState === 'will-start') this.transitionTo('done-start')
        break
      case 'stop':
        if (this.currentState === 'will-stop') this.transitionTo('done-stop')
        break
    }
  }

  willStop() {
    return ['will-stop', 'done-stop'].includes(this.currentState)
  }

  async stopped() {
    await this.transitionedTo('done-stop')
  }

  willStart() {
    return ['will-start', 'done-start'].includes(this.currentState)
  }

  async started() {
    await this.transitionedTo('done-start')
  }

  blockFor(reason /*: string */) {
    this.log.debug(`blocking for ${reason}`)
    this.blockedFor = reason
  }

  unblockFor(reason /*: string */) {
    this.log.debug(`unblocking for ${reason}`)
    if (reason === 'all' || reason === this.blockedFor) {
      this.blockedFor = null
      this.emit('ready')
    }
  }

  async ready() /*: Promise<void> */ {
    return new Promise(resolve => {
      this.once('ready', resolve)
      if (this.blockedFor == null) {
        resolve()
        this.off('ready', resolve)
      }
    })
  }
}

module.exports = { LifeCycle }
