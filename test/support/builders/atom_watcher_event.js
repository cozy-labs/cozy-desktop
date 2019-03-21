/* @flow */

const _ = require('lodash')
const path = require('path')

const metadata = require('../../../core/metadata')
const events = require('../../../core/local/steps/event')

const statsBuilder = require('./stats')

/*::
import type { Stats } from 'fs'
import type { Metadata } from '../../../core/metadata'
import type { AtomWatcherEvent, EventAction, EventKind, Batch } from '../../../core/local/steps/event'
import type { StatsBuilder } from './stats'
*/

function randomPick /*:: <T> */ (elements /*: Array<T> */) /*: T */{
  const l = elements.length
  const i = Math.floor(Math.random() * l)
  return elements[i]
}

function kind (doc /*: Metadata */) /*: EventKind */ {
  return doc.docType === 'folder' ? 'directory' : doc.docType
}

module.exports = class AtomWatcherEventBuilder {
  /*::
  _event: AtomWatcherEvent
  _statsBuilder: ?StatsBuilder
  */

  constructor (old /*: ?AtomWatcherEvent */) {
    if (old) {
      this._event = _.cloneDeep(old)
    } else {
      const kind = randomPick(events.KINDS)
      this._event = {
        action: randomPick(events.ACTIONS),
        kind,
        path: '/',
        _id: '/'
      }
    }
    this._ensureStatsBuilder()
  }

  _ensureStatsBuilder () /*: StatsBuilder */ {
    this._statsBuilder = this._statsBuilder ||
      statsBuilder
        .fromStats(this._event.stats)
        .kind(this._event.kind)
    return this._statsBuilder
  }

  fromDoc (doc /*: Metadata */) /*: this */ {
    const updatedAt = new Date(doc.updated_at)

    let builder =
      this
        .kind(kind(doc))
        .path(doc.path)
        .ctime(updatedAt)
        .mtime(updatedAt)
    if (doc.ino) builder = builder.ino(doc.ino)
    return builder
  }

  build () /*: AtomWatcherEvent */ {
    if (this._statsBuilder) {
      this._event.stats = this._statsBuilder.build()
    }
    return this._event
  }

  action (newAction /*: EventAction */) /*: this */ {
    this._event.action = newAction

    if (newAction === 'deleted') this.noStats()

    return this
  }

  kind (newKind /*: EventKind */) /*: this */ {
    this._event.kind = newKind
    if (this._statsBuilder) this._statsBuilder.kind(newKind)
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
    this._ensureStatsBuilder().ino(newIno)
    return this
  }

  mtime (newMtime /*: Date */) /*: this */ {
    this._ensureStatsBuilder().mtime(newMtime)
    return this
  }

  ctime (newCtime /*: Date */) /*: this */ {
    this._ensureStatsBuilder().ctime(newCtime)
    return this
  }

  noStats () /*: this */ {
    delete this._event.stats
    delete this._statsBuilder
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
    delete this._event.md5sum
    return this.noStats()
  }
}
