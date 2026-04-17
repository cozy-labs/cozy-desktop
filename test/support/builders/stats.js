/**
 * @module test/support/builders/stats
 * @flow
 */

const fs = require('fs')

const _ = require('lodash')

/*::
import type { Stats, WinStats } from '../../../core/local/stater'
import type { EventKind } from '../../../core/local/channel_watcher/event'

export interface StatsBuilder {
  ino (number): StatsBuilder,
  size (number): StatsBuilder,
  kind (EventKind): StatsBuilder,
  mtime (Date) : StatsBuilder,
  ctime (Date) : StatsBuilder,
  build (): Stats
}
*/

const nonExecutableModeSync = path => fs.statSync(path).mode & (0 << 6)

const defaultDirMode = nonExecutableModeSync(__dirname)
const defaultFileMode = nonExecutableModeSync(__filename)
const defaultDate = () => new Date()
const defaultTime = () => defaultDate().getTime()
const commonDefaults = () => ({
  ino: 1,
  size: 0
})
const unixTimes = () => ({
  atimeMs: defaultTime(),
  mtimeMs: defaultTime(),
  ctimeMs: defaultTime()
})
const winTimes = () => ({
  atime: defaultDate(),
  mtime: defaultDate(),
  ctime: defaultDate()
})

/** Build a Node.js fs.Stats object */
class DefaultStatsBuilder {
  /*::
  stats: fs.Stats
  */

  constructor(oldStats /*: ?fs.Stats */) {
    if (oldStats) {
      this.stats = _.clone(oldStats)
    } else {
      this.stats = Object.assign(
        fs.statSync(__filename),
        {
          mode: defaultFileMode,
          birthtimeMs: defaultTime()
        },
        commonDefaults(),
        unixTimes()
      )
    }
  }

  ino(newIno /*: number */) /*: this */ {
    this.stats.ino = newIno
    return this
  }

  size(newSize /*: number */) /*: this */ {
    this.stats.size = newSize
    return this
  }

  kind(newKind /*: EventKind */) /*: this */ {
    this.stats.mode = newKind === 'file' ? defaultFileMode : defaultDirMode
    return this
  }

  mtime(newMtime /*: Date */) /*: this */ {
    this.stats.mtimeMs = newMtime.getTime()
    return this
  }

  ctime(newCtime /*: Date */) /*: this */ {
    this.stats.ctimeMs = newCtime.getTime()
    return this
  }

  build() {
    return this.stats
  }
}

/** A fileid in @gyselroth/windows-fsstat is represented as a 16 digits
 * hexadecimal string.
 */
const fileIdFromNumber = (n /*: number */) =>
  '0x' +
  n
    .toString(16)
    .toUpperCase()
    .padStart(16, '0')

/** Build a @gyselroth/windows-fsstat object */
class WinStatsBuilder {
  /*::
  winStats: WinStats
  */

  constructor(oldStats /*: ?WinStats */) {
    this.winStats = oldStats
      ? _.clone(oldStats)
      : Object.assign(
          ({
            fileid: fileIdFromNumber(commonDefaults().ino),
            directory: false,
            symbolicLink: false
          } /*: Object */),
          commonDefaults(),
          winTimes()
        )
  }

  ino(newIno /*: number */) /*: this */ {
    this.winStats.fileid = fileIdFromNumber(newIno)
    this.winStats.ino = newIno
    return this
  }

  size(newSize /*: number */) /*: this */ {
    this.winStats.size = newSize
    return this
  }

  kind(newKind /*: EventKind */) /*: this */ {
    this.winStats.directory = newKind === 'directory'
    this.winStats.symbolicLink = newKind === 'symlink'
    return this
  }

  mtime(newMtime /*: Date */) /*: this */ {
    this.winStats.mtime = newMtime
    return this
  }

  ctime(newCtime /*: Date */) /*: this */ {
    this.winStats.ctime = newCtime
    return this
  }

  build() {
    return this.winStats
  }
}

const forPlatform = (platform = process.platform) =>
  platform === 'win32' ? new WinStatsBuilder() : new DefaultStatsBuilder()

const fromStats = (baseStats /*: ?(WinStats | fs.Stats) */) => {
  if (baseStats instanceof fs.Stats) return new DefaultStatsBuilder(baseStats)
  if (baseStats != null) return new WinStatsBuilder(baseStats)
  return forPlatform()
}

const platformIno = (
  ino /*: number */,
  platform /*: string */ = process.platform
) /*: number|string */ => {
  return platform === 'win32' ? fileIdFromNumber(ino) : ino
}

module.exports = {
  DefaultStatsBuilder,
  WinStatsBuilder,
  fileIdFromNumber,
  fromStats,
  platformIno
}
