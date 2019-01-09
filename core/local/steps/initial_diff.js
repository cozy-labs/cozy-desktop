/* @flow */

const { id } = require('../../metadata')
const Buffer = require('./buffer')

const logger = require('../../logger')
const log = logger({
  component: 'initialDiff'
})

/*::
import type Pouch from '../../pouch'
import type { Batch, EventKind } from './event'
import type { Metadata } from '../../metadata'

type WatchedPath = {
  path: string,
  kind: EventKind,
}
*/

// Some files and directories can have been deleted while cozy-desktop was
// stopped. So, at the end of the initial scan, we have to do a diff between
// what was in pouchdb and the events from the local watcher to find what was
// deleted.
async function initialDiff (buffer /*: Buffer */, out /*: Buffer */, pouch /*: Pouch */) /*: Promise<void> */ {
  // XXX we wait to receive the first batch of events before initializing this
  // component, as pouchdb may not be initialized when initialDiff is created
  // (its views are added later, but before the local watcher is started, thus
  // before the first batch of events)
  let events = await buffer.pop()

  // Using inode/fileId is more robust that using path or id for detecting
  // which files/folders have been deleted, as it is stable even if the
  // file/folder has been moved or renamed
  const byInode /*: Map<number|string, WatchedPath> */ = new Map()
  const docs /*: Metadata[] */ = await pouch.byRecursivePathAsync('')
  for (const doc of docs) {
    if (doc.ino != null) {
      // Process only files/dirs that were created locally or synchronized
      const kind = doc.docType === 'file' ? 'file' : 'directory'
      byInode.set(doc.fileid || doc.ino, { path: doc.path, kind: kind })
    }
  }
  let done = false

  while (true) {
    if (done) {
      out.push(events)
      continue
    }

    const batch /*: Batch */ = []
    for (const event of events) {
      if (event.incomplete) {
        batch.push(event)
        continue
      }

      // Detect if the file was moved while the client was stopped
      if (['created', 'scan'].includes(event.action)) {
        let was /*: ?WatchedPath */
        if (event.stats.fileid) {
          was = byInode.get(event.stats.fileid)
        }
        if (!was) {
          was = byInode.get(event.stats.ino)
        }
        if (was && was.path !== event.path) {
          if (was.kind === event.kind) {
            // TODO for a directory, maybe we should check the children
            event.action = 'renamed'
            event.oldPath = was.path
          } else {
            // On linux, the inodes can have been reused: a file was deleted
            // and a directory created just after while the client was stopped
            // for example.
            batch.push({
              action: 'deleted',
              kind: was.kind,
              _id: id(was.path),
              path: was.path
            })
          }
        }
      }

      if (['created', 'modified', 'renamed', 'scan'].includes(event.action)) {
        if (event.stats.fileid) {
          byInode.delete(event.stats.fileid)
        }
        byInode.delete(event.stats.ino)
      } else if (event.action === 'initial-scan-done') {
        // Emit deleted events for all the remaining files/dirs
        for (const [, doc] of byInode) {
          batch.push({
            action: 'deleted',
            kind: doc.kind,
            _id: id(doc.path),
            path: doc.path
          })
        }
        byInode.clear()
        done = true
      }
      batch.push(event)
    }

    out.push(batch)
    events = await buffer.pop()
  }
}

module.exports = function (buffer /*: Buffer */, opts /*: { pouch: Pouch } */) /*: Buffer */ {
  const out = new Buffer()
  initialDiff(buffer, out, opts.pouch)
    .catch(err => log.error({err}))
  return out
}
