/* @flow */

const { Observable } = require('rxjs')
const fse = require('fs-extra')
const path = require('path')
const watcher = require('@atom/watcher')

/*::
import type { Observer } from 'rxjs'
*/

module.exports = function (syncPath /*: string */) {
  let running = false
  let watchers = new Map()
  let process = () => {}
  let watch = async () => {}

  const atomWatcher = Observable.create(function (observer /*: Observer */) {
    console.log('atomWatcher started')
    running = true
    process = (events) => {
      console.log('process', events)
      if (!running) {
        return
      }
      // TODO stats + id
      // TODO call watch for new folders
      observer.next(events)
    }

    return () => {
      console.log('atomWatcher stopped')
      running = false
      for (const [, w] of watchers) {
        w.dispose()
      }
      watchers = new Map()
      process = () => {}
    }
  })

  const initialScan = Observable.create(async function (observer /*: Observer */) {
    console.log('initialScan started')
    watch = async (relativePath) => {
      console.log('watch', relativePath)
      try {
        if (!running || watchers.has(relativePath)) {
          return
        }
        const fullPath = path.join(syncPath, relativePath)
        console.log('watchPath', process)
        const w = await watcher.watchPath(fullPath, { recursive: false }, process)
        if (!running || watchers.has(relativePath)) {
          w.dispose()
          return
        }
        watchers.set(relativePath, w)
        const batch = []
        for (const entry of await fse.readdir(fullPath)) {
          const p = path.join(syncPath, entry)
          // TODO stats
          // TODO ignore
          batch.push(p)
          observer.next(p)
        }
        // TODO
        // for (const event of batch) {
        //   if (event.doc.docType === 'folder') {
        //     await watch(event.doc.path)
        //   }
        // }
      } catch (err) {
        // The directory may been removed since we wanted to watch it
      }
    }

    try {
      await watch('.')
      observer.complete()
    } catch (err) {
      observer.error(err)
    }
  })

  return { initialScan, atomWatcher }
}
