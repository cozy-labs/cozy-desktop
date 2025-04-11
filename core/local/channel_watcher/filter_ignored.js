/** This step removes events about files and directories that are ignored.
 *
 * It's better to put this step as soon as possible in the chain to avoid
 * doing useless computing for ignored files/directories (like adding inotify
 * watchers), but it needs to be put after the AddInfos step as the docType is
 * required to know if the event can be ignored.
 *
 * @module core/local/channel_watcher/filter_ignored
 * @flow
 */

const _ = require('lodash')

const { logger } = require('../../utils/logger')
const { measureTime } = require('../../utils/perfs')

/*::
import type Channel from './channel'
import type { ChannelEvent, EventKind } from './event'
import type { Ignore } from '../../ignore'
*/

const STEP_NAME = 'filterIgnored'

const log = logger({
  component: `ChannelWatcher/${STEP_NAME}`
})

module.exports = {
  STEP_NAME,
  loop
}

function loop(
  channel /*: Channel */,
  opts /*: { ignore: Ignore, fatal: Error => any } */
) /*: Channel */ {
  const isIgnored = (path /*: string */, kind /*: EventKind */) =>
    opts.ignore.isIgnored({
      relativePath: path,
      isFolder: kind === 'directory'
    })

  return channel.map(events => {
    const stopMeasure = measureTime('LocalWatcher#filterIgnoredStep')

    const batch = []

    for (const event of events) {
      const eventToKeep = notIgnoredEvent(event, isIgnored)

      if (eventToKeep) {
        batch.push(eventToKeep)
      } else {
        log.debug('Ignored via syncignore', { event })
      }
    }

    stopMeasure()
    return batch
  }, opts.fatal)
}

function notIgnoredEvent(
  event /*: ChannelEvent */,
  isIgnored /*: (string, EventKind) => boolean */
) /*: ?ChannelEvent */ {
  if (event.noIgnore) {
    return event
  }

  const isPathIgnored = isIgnored(event.path, event.kind)

  if (event.action === 'renamed' && event.oldPath != null) {
    const isOldPathIgnored = isIgnored(event.oldPath, event.kind)

    if (!isOldPathIgnored && isPathIgnored) {
      return movedToIgnoredPath(event)
    } else if (isOldPathIgnored && !isPathIgnored) {
      return movedFromIgnoredPath(event)
    } else if (!isOldPathIgnored && !isPathIgnored) {
      return event
    }
  } else if (!isPathIgnored) {
    return event
  }

  return null
}

function movedFromIgnoredPath(event /*: ChannelEvent */) /*: ChannelEvent */ {
  const createdEvent = {
    ...event,
    action: 'created'
  }
  _.set(createdEvent, [STEP_NAME, 'movedFromIgnoredPath'], createdEvent.oldPath)
  delete createdEvent.oldPath

  return createdEvent
}

function movedToIgnoredPath(event /*: ChannelEvent */) /*: ChannelEvent */ {
  const deletedEvent = {
    ...event,
    action: 'deleted'
  }
  _.set(deletedEvent, [STEP_NAME, 'movedToIgnoredPath'], deletedEvent.path)
  deletedEvent.path = deletedEvent.oldPath
  delete deletedEvent.oldPath

  return deletedEvent
}
