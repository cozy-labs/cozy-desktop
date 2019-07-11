/**
 * @module core/local/chokidar/squash_moves
 * @flow
 */

const path = require('path')
const _ = require('lodash')

const logger = require('../../utils/logger')
const measureTime = require('../../utils/perfs')

const component = 'chokidar/squash_moves'
const log = logger({ component })

/*::
import type { LocalChange } from './local_change'
*/

const sortBeforeSquash = (changes /*: LocalChange[] */) => {
  log.trace('Sort changes before squash...')
  const stopMeasure = measureTime(`${component}#sortBeforeSquash`)
  changes.sort((a, b) => {
    if (a.type === 'DirMove' || a.type === 'FileMove') {
      if (b.type === 'DirMove' || b.type === 'FileMove') {
        if (a.path < b.path) return -1
        else if (a.path > b.path) return 1
        else return 0
      } else return -1
    } else if (b.type === 'DirMove' || b.type === 'FileMove') {
      return 1
    } else {
      return 0
    }
  })
  stopMeasure()
}

const squash = (changes /*: LocalChange[] */) => {
  log.trace('Squash moves...')
  const stopMeasure = measureTime(`${component}#squash`)

  for (let i = 0; i < changes.length; i++) {
    let a = changes[i]

    if (a.type !== 'DirMove' && a.type !== 'FileMove') break
    for (let j = i + 1; j < changes.length; j++) {
      let b = changes[j]
      if (b.type !== 'DirMove' && b.type !== 'FileMove') break

      // inline of LocalChange.isChildMove
      if (
        a.type === 'DirMove' &&
        b.path.indexOf(a.path + path.sep) === 0 &&
        a.old &&
        b.old &&
        b.old.path.indexOf(a.old.path + path.sep) === 0
      ) {
        log.debug({ oldpath: b.old.path, path: b.path }, 'descendant move')
        a.wip = a.wip || b.wip
        if (
          b.path.substr(a.path.length) === b.old.path.substr(a.old.path.length)
        ) {
          log.debug(
            { oldpath: b.old.path, path: b.path },
            'ignoring explicit child move'
          )
          changes.splice(j--, 1)
          if (b.type === 'FileMove' && b.update) {
            changes.push({
              sideName: 'local',
              type: 'FileUpdate',
              path: b.update.path,
              stats: b.update.stats,
              ino: b.ino,
              md5sum: b.update.md5sum,
              old: _.defaults({ path: b.update.path }, b.old),
              needRefetch: true
            })
          }
        } else {
          log.debug({ oldpath: b.old.path, path: b.path }, 'move inside move')
          b.old.path = b.old.path.replace(a.old.path, a.path)
          b.needRefetch = true
        }
      }
    }
  }

  stopMeasure()
}

/** First sort changes to make moves squashing easier.
 * Then aggregate descendant moves with their corresponding root move change.
 */
const squashMoves = (changes /*: LocalChange[] */) => {
  sortBeforeSquash(changes)
  squash(changes)
}

module.exports = {
  squashMoves
}
