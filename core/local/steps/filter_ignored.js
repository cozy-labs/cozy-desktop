/* @flow */

/*::
import type Buffer from './buffer'
import type { AtomWatcherEvent } from './event'
import type { Ignore } from '../../ignore'
*/

// This step removes events about files and directories that are ignored. It's
// better to put this step as soon as possible in the chain to avoid doing
// useless computing for ignored files/directories (like adding inotify
// watchers), but it needs to be put after the AddInfos step as the docType is
// required to know if the event can be ignored.
module.exports = function (buffer /*: Buffer */, opts /*: { ignore: Ignore } */) /*: Buffer */ {
  const notIgnored = buildNotIgnored(opts.ignore)

  return buffer.map((batch) => {
    return batch.filter(notIgnored)
  })
}

function buildNotIgnored (ignoreRules /*: Ignore */) /*: ((AtomWatcherEvent) => boolean) */ {
  return (event /*: AtomWatcherEvent */) /*: boolean */ => {
    if (event.noIgnore) {
      return true
    }
    return !ignoreRules.isIgnored({
      relativePath: event.path,
      isFolder: event.kind === 'directory'
    })
  }
}
