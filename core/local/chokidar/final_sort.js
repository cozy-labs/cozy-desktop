/**
 * @module core/local/chokidar/final_sort
 * @flow
 */

const localChange = require('./local_change')
const logger = require('../../utils/logger')
const measureTime = require('../../utils/perfs')

/*::
import type { LocalChange } from './local_change'
*/

const component = 'chokidar/final_sort'
const log = logger({ component })

const finalSorter = (a /*: LocalChange */, b /*: LocalChange */) => {
  if (a.wip && !b.wip) return -1
  if (b.wip && !a.wip) return 1

  // b is deleting something which is a children of what a adds
  if (
    !localChange.addPath(b) &&
    localChange.childOf(localChange.addPath(a), localChange.delPath(b))
  )
    return 1
  // a is deleting something which is a children of what b adds
  if (
    !localChange.addPath(a) &&
    localChange.childOf(localChange.addPath(b), localChange.delPath(a))
  )
    return -1

  // b is moving something which is a children of what a adds
  if (localChange.childOf(localChange.addPath(a), localChange.delPath(b)))
    return -1
  // a is deleting or moving something which is a children of what b adds
  if (localChange.childOf(localChange.addPath(b), localChange.delPath(a)))
    return 1

  // if one change is a child of another, it takes priority
  if (localChange.isChildAdd(a, b)) return -1
  if (localChange.isChildUpdate(a, b)) return -1
  if (localChange.isChildDelete(b, a)) return -1
  if (localChange.isChildAdd(b, a)) return 1
  if (localChange.isChildUpdate(b, a)) return 1
  if (localChange.isChildDelete(a, b)) return 1

  // a is deleted what b added
  if (localChange.delPath(a) === localChange.addPath(b)) return -1
  // b is deleting what a added
  if (localChange.delPath(b) === localChange.addPath(a)) return 1

  // both adds at same path (seen with move + add)
  if (
    localChange.addPath(a) &&
    localChange.addPath(a) === localChange.addPath(b)
  )
    return -1
  // both deletes at same path (seen with delete + move)
  if (
    localChange.delPath(a) &&
    localChange.delPath(a) === localChange.delPath(b)
  )
    return 1

  // otherwise, order by add path
  if (localChange.lower(localChange.addPath(a), localChange.addPath(b)))
    return -1
  if (localChange.lower(localChange.addPath(b), localChange.addPath(a)))
    return 1

  // if there isnt 2 add paths, sort by del path
  if (localChange.lower(localChange.delPath(b), localChange.delPath(a)))
    return -1

  return 1
}

/** Final sort to ensure multiple changes at the same paths can be merged.
 *
 * Known issues:
 *
 * - Hard to change without breaking things.
 */
const finalSort = (changes /*: LocalChange[] */) => {
  log.trace('Final sort...')
  const stopMeasure = measureTime('LocalWatcher#finalSort')
  changes.sort(finalSorter)
  stopMeasure()
}

module.exports = {
  finalSort
}
