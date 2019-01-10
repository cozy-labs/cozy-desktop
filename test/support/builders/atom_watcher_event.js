/* @flow */

const metadata = require('../../../core/metadata')
const events = require('../../../core/local/steps/event')

/*::
import type { Stats } from 'fs'
import type { AtomWatcherEvent, EventAction, EventKind, Batch } from '../../../core/local/steps/event'
*/

function randomPick /*:: <T> */ (elements /*: Array<T> */) /*: T */{
  const l = elements.length
  const i = Math.floor(Math.random() * l)
  return elements[i]
}

module.exports = class AtomWatcherEventBuilder {
  /*::
  _event: AtomWatcherEvent
  */

  constructor () {
    this._event = {
      action: randomPick(events.ACTIONS),
      kind: randomPick(events.KINDS),
      path: '/',
      _id: '/'
    }
  }

  build () /*: AtomWatcherEvent */ {
    return this._event
  }

  action (newAction /*: EventAction */) /*: this */ {
    this._event.action = newAction
    return this
  }

  kind (newKind /*: EventKind */) /*: this */ {
    this._event.kind = newKind
    return this
  }

  path (newPath /*: string */) /*: this */ {
    this._event.path = newPath
    this._event._id = metadata.id(newPath)
    return this
  }

  oldPath (newPath /*: string */) /*: this */{
    this._event.oldPath = newPath
    return this
  }

  id (newId /*: string */) /*: this */ {
    this._event._id = newId
    return this
  }

  stats (newStats /*: Stats */) /*: this */ {
    this._event.stats = newStats
    return this
  }

  md5sum (newMd5sum /*: string */) /*: this */ {
    this._event.md5sum = newMd5sum
    return this
  }

  noIgnore () /*: this */ {
    this._event.noIgnore = true
    return this
  }
}
