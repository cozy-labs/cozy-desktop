/* @flow */

const fs = require('fs')
const _ = require('lodash')
const path = require('path')

const metadata = require('../../../core/metadata')
const events = require('../../../core/local/steps/event')

/*::
import type { Stats } from 'fs'
import type { AtomWatcherEvent, EventAction, EventKind, Batch } from '../../../core/local/steps/event'
*/

const NON_EXECUTABLE_MASK = 0 << 6

function randomPick /*:: <T> */ (elements /*: Array<T> */) /*: T */{
  const l = elements.length
  const i = Math.floor(Math.random() * l)
  return elements[i]
}

function buildStats (kind /*: EventKind */) /*: fs.Stats */ {
  let baseStats /*: fs.Stats */
  if (kind === 'file') {
    baseStats = fs.statSync(__filename)
  } else {
    baseStats = fs.statSync(__dirname)
  }

  return _.defaults(
    {
      atime: new Date(),
      mtime: new Date(),
      ctime: new Date(),
      birthtime: new Date(),
      mode: baseStats.mode & NON_EXECUTABLE_MASK,
      size: 0
    },
    _.omit(baseStats, ['executable'])
  )
}

module.exports = class AtomWatcherEventBuilder {
  /*::
  _event: AtomWatcherEvent
  */

  constructor (old /*: ?AtomWatcherEvent */) {
    if (old) {
      this._event = _.cloneDeep(old)
    } else {
      const kind = randomPick(events.KINDS)
      const stats = buildStats(kind)
      this._event = {
        action: randomPick(events.ACTIONS),
        kind,
        path: '/',
        _id: '/',
        stats
      }
    }
  }

  build () /*: AtomWatcherEvent */ {
    return this._event
  }

  action (newAction /*: EventAction */) /*: this */ {
    this._event.action = newAction

    if (newAction === 'deleted') this.noStats()

    return this
  }

  kind (newKind /*: EventKind */) /*: this */ {
    this._event.kind = newKind
    return this
  }

  path (newPath /*: string */) /*: this */ {
    this._event.path = path.normalize(newPath)
    this._event._id = metadata.id(newPath)
    return this
  }

  oldPath (newPath /*: string */) /*: this */{
    this._event.oldPath = path.normalize(newPath)
    return this
  }

  id (newId /*: string */) /*: this */ {
    this._event._id = newId
    return this
  }

  ino (newIno /*: number */) /*: this */ {
    if (this._event.stats == null) this._event.stats = buildStats(this._event.kind)
    this._event.stats.ino = newIno
    return this
  }

  noStats () /*: this */ {
    delete this._event.stats
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

  incomplete () /*: this */ {
    this._event.incomplete = true
    this.noStats()
    return this
  }
}
