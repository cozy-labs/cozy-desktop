/* @flow */

const logger = require('../../logger')

/*::
import type Channel from './channel'
import type { AtomWatcherEvent } from './event'
import type { Ignore } from '../../ignore'
*/

const STEP_NAME = 'filterIgnored'

const log = logger({
  component: `atom/${STEP_NAME}`
})

module.exports = {
  loop
}

// This step removes events about files and directories that are ignored. It's
// better to put this step as soon as possible in the chain to avoid doing
// useless computing for ignored files/directories (like adding inotify
// watchers), but it needs to be put after the AddInfos step as the docType is
// required to know if the event can be ignored.
function loop(
  channel /*: Channel */,
  opts /*: { ignore: Ignore } */
) /*: Channel */ {
  const notIgnored = buildNotIgnored(opts.ignore)

  return channel.map(batch => {
    return batch.filter(notIgnored)
  })
}

function buildNotIgnored(
  ignoreRules /*: Ignore */
) /*: ((AtomWatcherEvent) => boolean) */ {
  return (event /*: AtomWatcherEvent */) /*: boolean */ => {
    if (event.noIgnore) {
      return true
    }
    const relativePath = event.path
    const isFolder = event.kind === 'directory'
    const isIgnored = ignoreRules.isIgnored({ relativePath, isFolder })
    if (isIgnored) log.debug({ event }, 'Ignored')
    return !isIgnored
  }
}
