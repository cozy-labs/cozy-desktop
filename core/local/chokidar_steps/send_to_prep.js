/* @flow */

const logger = require('../../logger')
const metadata = require('../../metadata')

/*::
import type fse from 'fs-extra'

import type {
  LocalChange,
  LocalDirAddition,
  LocalDirDeletion,
  LocalDirMove,
  LocalFileAddition,
  LocalFileDeletion,
  LocalFileMove,
  LocalFileUpdate
} from '../change'
import type {
  LocalFileAdded,
  LocalFileUpdated
} from '../event'
import type Pouch from '../../pouch'
import type Prep from '../../prep'

export type SendToPrepOptions = {
  pouch: Pouch,
  prep: Prep
}
*/

module.exports = {
  step
}

const log = logger({
  component: 'ChokidarSendToPrep'
})

const SIDE = 'local'

// @TODO inline this.onXXX in this function
// @TODO rename LocalChange types to prep.xxxxxx
async function step (changes /*: LocalChange[] */, {prep, pouch} /*: SendToPrepOptions */) {
  const errors /*: Error[] */ = []
  for (let c of changes) {
    try {
      if (c.needRefetch) {
        // $FlowFixMe
        c.old = await pouch.db.get(metadata.id(c.old.path))
      }
      switch (c.type) {
        // TODO: Inline old LocalWatcher methods
        case 'DirDeletion':
          await onUnlinkDir(c, prep)
          break
        case 'FileDeletion':
          await onUnlinkFile(c, prep)
          break
        case 'DirAddition':
          await onAddDir(c, prep)
          break
        case 'FileUpdate':
          await onChange(c, prep)
          break
        case 'FileAddition':
          await onAddFile(c, prep)
          break
        case 'FileMove':
          await onMoveFile(c, prep)
          if (c.update) await onChange(c.update, prep)
          break
        case 'DirMove':
          await onMoveFolder(c, prep)
          break
        case 'Ignored':
          break
        default:
          throw new Error('wrong changes')
      }
    } catch (err) {
      log.error({path: c.path, err})
      errors.push(err)
    }
  }

  if (errors.length > 0) {
    throw new Error(`Could not apply all changes to Prep:\n- ${errors.map(e => e.stack).join('\n- ')}`)
  }
}

// New file detected
function onAddFile ({path: filePath, stats, md5sum} /*: LocalFileAddition */, prep /*: Prep */) {
  const logError = (err) => log.error({err, path: filePath})
  const doc = metadata.buildFile(filePath, stats, md5sum)
  log.info({path: filePath}, 'FileAddition')
  return prep.addFileAsync(SIDE, doc).catch(logError)
}

async function onMoveFile ({path: filePath, stats, md5sum, old, overwrite} /*: LocalFileMove */, prep /*: Prep */) {
  const logError = (err) => log.error({err, path: filePath})
  const doc = metadata.buildFile(filePath, stats, md5sum, old.remote)
  if (overwrite) doc.overwrite = overwrite
  log.info({path: filePath, oldpath: old.path}, 'FileMove')
  return prep.moveFileAsync(SIDE, doc, old).catch(logError)
}

function onMoveFolder ({path: folderPath, stats, old, overwrite} /*: LocalDirMove */, prep /*: Prep */) {
  const logError = (err) => log.error({err, path: folderPath})
  const doc = metadata.buildDir(folderPath, stats, old.remote)
  // $FlowFixMe we set doc.overwrite to true, it will be replaced by metadata in merge
  if (overwrite) doc.overwrite = overwrite
  log.info({path: folderPath, oldpath: old.path}, 'DirMove')
  return prep.moveFolderAsync(SIDE, doc, old).catch(logError)
}

// New directory detected
function onAddDir ({path: folderPath, stats} /*: LocalDirAddition */, prep /*: Prep */) {
  const doc = metadata.buildDir(folderPath, stats)
  log.info({path: folderPath}, 'DirAddition')
  return prep.putFolderAsync(SIDE, doc).catch(err => log.error({err, path: folderPath}))
}

// File deletion detected
//
// It can be a file moved out. So, we wait a bit to see if a file with the
// same checksum is added and, if not, we declare this file as deleted.
function onUnlinkFile ({path: filePath} /*: LocalFileDeletion */, prep /*: Prep */) {
  log.info({path: filePath}, 'FileDeletion')
  return prep.trashFileAsync(SIDE, {path: filePath}).catch(err => log.error({err, path: filePath}))
}

// Folder deletion detected
//
// We don't want to delete a folder before files inside it. So we wait a bit
// after chokidar event to declare the folder as deleted.
function onUnlinkDir ({path: folderPath} /*: LocalDirDeletion */, prep /*: Prep */) {
  log.info({path: folderPath}, 'DirDeletion')
  return prep.trashFolderAsync(SIDE, {path: folderPath}).catch(err => log.error({err, path: folderPath}))
}

// File update detected
function onChange ({path: filePath, stats, md5sum} /*: LocalFileUpdate|LocalFileAdded|LocalFileUpdated */, prep /*: Prep */) {
  log.info({path: filePath}, 'FileUpdate')
  const doc = metadata.buildFile(filePath, stats, md5sum)
  return prep.updateFileAsync(SIDE, doc)
}
