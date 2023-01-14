/* @flow */

const _ = require('lodash')
const path = require('path')

const { FILE, FOLDER } = require('../../../core/metadata')
const events = require('../../../core/local/channel_watcher/event')

const statsBuilder = require('./stats')
const ChecksumBuilder = require('./checksum')

/*::
import type { Stats } from 'fs'
import type { Metadata } from '../../../core/metadata'
import type { ChannelEvent, EventAction, EventKind } from '../../../core/local/channel_watcher/event'
import type { StatsBuilder } from './stats'
*/

function randomPick /*:: <T> */(elements /*: Array<T> */) /*: T */ {
  const l = elements.length
  const i = Math.floor(Math.random() * l)
  return elements[i]
}

function kind(doc /*: Metadata */) /*: EventKind */ {
  return doc.docType === FOLDER ? 'directory' : FILE
}

const defaultPath = 'foo'

module.exports = class ChannelEventBuilder {
  /*::
  _event: ChannelEvent
  _statsBuilder: ?StatsBuilder
  */

  constructor(old /*: ?ChannelEvent */) {
    if (old) {
      this._event = _.cloneDeep(old)
    } else {
      const kind = randomPick(events.KINDS)
      this._event = {
        action: randomPick(events.ACTIONS),
        kind,
        path: defaultPath
      }
    }
    this._ensureStatsBuilder()
  }

  _ensureStatsBuilder() /*: StatsBuilder */ {
    this._statsBuilder =
      this._statsBuilder ||
      statsBuilder.fromStats(this._event.stats).kind(this._event.kind)
    return this._statsBuilder
  }

  fromDoc(doc /*: Metadata */) /*: this */ {
    const updatedAt = new Date(doc.updated_at)

    let builder = this.kind(kind(doc))
      .path(doc.path)
      .ctime(updatedAt)
      .mtime(updatedAt)
    if (doc.ino) builder = builder.ino(doc.ino)
    return builder
  }

  build() /*: ChannelEvent */ {
    if (this._statsBuilder) {
      this._event.stats = this._statsBuilder.build()
    }
    return this._event
  }

  action(newAction /*: EventAction */) /*: this */ {
    this._event.action = newAction

    if (newAction === 'deleted') this.noStats()

    return this
  }

  kind(newKind /*: EventKind */) /*: this */ {
    this._event.kind = newKind
    if (this._statsBuilder) this._statsBuilder.kind(newKind)
    return this
  }

  path(newPath /*: string */) /*: this */ {
    this._event.path = path.normalize(newPath)
    return this
  }

  oldPath(newPath /*: string */) /*: this */ {
    this._event.oldPath = path.normalize(newPath)
    return this
  }

  ino(newIno /*: number */) /*: this */ {
    this._ensureStatsBuilder().ino(newIno)
    return this
  }

  deletedIno(ino /*: number */) /*: this */ {
    if (this._event.action === 'deleted') {
      this._event.deletedIno = statsBuilder.platformIno(ino)
    }
    return this
  }

  size(newSize /*: number */) /*: this */ {
    this._ensureStatsBuilder().size(newSize)
    return this
  }

  mtime(newMtime /*: Date */) /*: this */ {
    this._ensureStatsBuilder().mtime(newMtime)
    return this
  }

  ctime(newCtime /*: Date */) /*: this */ {
    this._ensureStatsBuilder().ctime(newCtime)
    return this
  }

  noStats() /*: this */ {
    delete this._event.stats
    delete this._statsBuilder
    return this
  }

  md5sum(newMd5sum /*: string */) /*: this */ {
    this._event.md5sum = newMd5sum
    return this
  }

  data(fileContent /*: string */) /*: this */ {
    return this.md5sum(new ChecksumBuilder(fileContent).build())
  }

  noIgnore() /*: this */ {
    this._event.noIgnore = true
    return this
  }

  incomplete() /*: this */ {
    this._event.incomplete = true
    delete this._event.md5sum
    return this.noStats()
  }

  overwrite() /*: this */ {
    this._event.overwrite = true
    return this
  }
}
