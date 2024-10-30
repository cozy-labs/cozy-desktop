/** Send LocalChanges to Prep/Merge
 *
 * @module core/local/chokidar/send_to_prep
 * @flow
 */

const metadata = require('../../metadata')
const { logger } = require('../../utils/logger')

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
} from './local_change'
import type {
  LocalFileAdded,
  LocalFileUpdated
} from './local_event'
import type { Pouch } from '../../pouch'
import type Prep from '../../prep'

type SendToPrepOpts = {
  pouch: Pouch,
  prep: Prep
}
*/

const log = logger({
  component: 'chokidar/send_to_prep'
})

const SIDE = 'local'

/** New file detected */
const onAddFile = (
  { path: filePath, stats, md5sum } /*: LocalFileAddition */,
  prep /*: Prep */
) => {
  const doc = metadata.buildFile(filePath, stats, md5sum)
  log.debug('FileAddition', { path: filePath })
  return prep.addFileAsync(SIDE, doc)
}

const onMoveFile = async (
  { path: filePath, stats, md5sum, old, overwrite } /*: LocalFileMove */,
  prep /*: Prep */
) => {
  const doc = metadata.buildFile(filePath, stats, md5sum, old.remote)
  if (overwrite) doc.overwrite = overwrite
  log.debug('FileMove', { path: filePath, oldpath: old.path })
  return prep.moveFileAsync(SIDE, doc, old)
}

const onMoveFolder = (
  { path: folderPath, stats, old, overwrite } /*: LocalDirMove */,
  prep /*: Prep */
) => {
  const doc = metadata.buildDir(folderPath, stats, old.remote)
  // $FlowFixMe we set doc.overwrite to true, it will be replaced by metadata in merge
  if (overwrite) doc.overwrite = overwrite
  log.debug('DirMove', { path: folderPath, oldpath: old.path })
  return prep.moveFolderAsync(SIDE, doc, old)
}

/** New directory detected */
const onAddDir = (
  { path: folderPath, stats } /*: LocalDirAddition */,
  prep /*: Prep */
) => {
  const doc = metadata.buildDir(folderPath, stats)
  log.debug('DirAddition', { path: folderPath })
  return prep.putFolderAsync(SIDE, doc)
}

/** File deletion detected
 *
 * It can be a file moved out. So, we wait a bit to see if a file with the
 * same checksum is added and, if not, we declare this file as deleted.
 */
const onUnlinkFile = (
  { path: filePath, old } /*: LocalFileDeletion */,
  prep /*: Prep */
) => {
  log.debug('FileDeletion', { path: filePath })
  if (!old) {
    log.debug('Assuming file already removed', { path: filePath })
    return
  }
  return prep.trashFileAsync(SIDE, old)
}

/** Folder deletion detected
 *
 * We don't want to delete a folder before files inside it. So we wait a bit
 * after chokidar event to declare the folder as deleted.
 */
const onUnlinkDir = (
  { path: folderPath, old } /*: LocalDirDeletion */,
  prep /*: Prep */
) => {
  log.debug('DirDeletion', { path: folderPath })
  if (!old) {
    log.debug('Assuming dir already removed', { path: folderPath })
    return
  }
  return prep.trashFolderAsync(SIDE, old)
}

/** File update detected */
const onChange = (
  {
    path: filePath,
    stats,
    md5sum
  } /*: LocalFileUpdate|LocalFileAdded|LocalFileUpdated */,
  prep /*: Prep */
) => {
  log.debug('FileUpdate', { path: filePath })
  const doc = metadata.buildFile(filePath, stats, md5sum)
  return prep.updateFileAsync(SIDE, doc)
}

// @TODO inline this.onXXX in this function
// @TODO rename LocalChange types to prep.xxxxxx
const step = async (
  changes /*: LocalChange[] */,
  { pouch, prep } /*: SendToPrepOpts */
) => {
  const errors /*: Error[] */ = []
  for (let c of changes) {
    try {
      if (c.type !== 'Ignored' && c.needRefetch && c.old) {
        c.old = await pouch.bySyncedPath(c.old.path)
      }
      switch (c.type) {
        // TODO: Inline old LocalWatcher methods
        case 'DirDeletion':
          if (!c.old) {
            c.old = await pouch.bySyncedPath(c.path)
          }
          await onUnlinkDir(c, prep)
          break
        case 'FileDeletion':
          if (!c.old) {
            c.old = await pouch.bySyncedPath(c.path)
          }
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
      log.warn({ path: c.path, err })
      errors.push(err)
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Could not apply all changes to Prep:\n- ${errors
        .map(e => e.stack)
        .join('\n- ')}`
    )
  }
}

module.exports = {
  step
}
