/** This step removes events about files and directories that are ignored.
 *
 * It's better to put this step as soon as possible in the chain to avoid
 * doing useless computing for ignored files/directories (like adding inotify
 * watchers), but it needs to be put after the AddInfos step as the docType is
 * required to know if the event can be ignored.
 *
 * @module core/local/atom/filter_ignored
 * @flow
 */

const _ = require('lodash')

const metadata = require('../../metadata')
const logger = require('../../utils/logger')

/*::
import type Channel from './channel'
import type { AtomEvent, EventKind } from './event'
import type { Ignore } from '../../ignore'
*/

const STEP_NAME = 'filterIgnored'

const log = logger({
  component: `atom/${STEP_NAME}`
})

module.exports = {
  STEP_NAME,
  loop
}

function loop(
  channel /*: Channel */,
  opts /*: { ignore: Ignore } */
) /*: Channel */ {
  const isIgnored = (path /*: string */, kind /*: EventKind */) =>
    opts.ignore.isIgnored({
      relativePath: path,
      isFolder: kind === 'directory'
    })

  return channel.map(events => {
    const batch = []

    for (const event of events) {
      const eventToKeep = notIgnoredEvent(event, isIgnored)

      if (eventToKeep) {
        batch.push(eventToKeep)
      } else {
        log.debug({ event }, 'Ignored via .cozyignore')
      }
    }

    return batch
  })
}

function notIgnoredEvent(
  event /*: AtomEvent */,
  isIgnored /*: (string, EventKind) => boolean */
) /*: ?AtomEvent */ {
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

function movedFromIgnoredPath(event /*: AtomEvent */) /*: AtomEvent */ {
  const createdEvent = {
    ...event,
    action: 'created'
  }
  _.set(createdEvent, [STEP_NAME, 'movedFromIgnoredPath'], createdEvent.oldPath)
  delete createdEvent.oldPath

  return createdEvent
}

function movedToIgnoredPath(event /*: AtomEvent */) /*: AtomEvent */ {
  const deletedEvent = {
    ...event,
    action: 'deleted'
  }
  _.set(deletedEvent, [STEP_NAME, 'movedToIgnoredPath'], deletedEvent.path)
  deletedEvent._id = metadata.id(deletedEvent.oldPath)
  deletedEvent.path = deletedEvent.oldPath
  delete deletedEvent.oldPath

  return deletedEvent
}
