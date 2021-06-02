/** Test data builders. Plain functions or Object mother patterns.
 *
 * @module test/support/builders
 * @flow
 */

const path = require('path')

const { ROOT_DIR_ID } = require('../../../core/remote/constants')

const DirMetadataBuilder = require('./metadata/dir')
const FileMetadataBuilder = require('./metadata/file')
const RemoteDirBuilder = require('./remote/dir')
const RemoteFileBuilder = require('./remote/file')
const RemoteNoteBuilder = require('./remote/note')
const RemoteErasedBuilder = require('./remote/erased')
const StreamBuilder = require('./stream')
const AtomEventBuilder = require('./atom_event')
const { DefaultStatsBuilder, WinStatsBuilder } = require('./stats')

/*::
import type { Cozy } from 'cozy-client-js'
import type { Metadata, MetadataRemoteFile, MetadataRemoteDir } from '../../../core/metadata'
import type { Pouch } from '../../../core/pouch'
import type { Warning } from '../../../core/remote/cozy'
import type { RemoteDoc, RemoteFile, RemoteDir } from '../../../core/remote/document'
import type { AtomEvent } from '../../../core/local/atom/event'
import type { StatsBuilder } from './stats'

export type RemoteTree = { [string]: MetadataRemoteFile|MetadataRemoteDir }
*/

// Test data builders facade.
//
//     builders.metafile()...
//     builders.remoteDir()...
//     builders.stream()...
//
module.exports = class Builders {
  /*::
  cozy: ?Cozy
  pouch: ?Pouch
  */

  constructor({ cozy, pouch } /*: {cozy?: Cozy, pouch?: Pouch} */ = {}) {
    this.cozy = cozy
    this.pouch = pouch
  }

  metadata(old /*: ?Metadata */) /*: DirMetadataBuilder|FileMetadataBuilder */ {
    return this.metadir(old)
  }

  metadir(old /*: ?Metadata */) /*: DirMetadataBuilder */ {
    return new DirMetadataBuilder(this.pouch, old)
  }

  metafile(old /*: ?Metadata */) /*: FileMetadataBuilder */ {
    return new FileMetadataBuilder(this.pouch, old)
  }

  remoteDir(old /*: ?RemoteDir|MetadataRemoteDir */) /*: RemoteDirBuilder */ {
    return new RemoteDirBuilder(this.cozy, old)
  }

  remoteFile(
    old /*: ?RemoteFile|MetadataRemoteFile */
  ) /*: RemoteFileBuilder */ {
    return new RemoteFileBuilder(this.cozy, old)
  }

  remoteNote(
    old /*: ?RemoteFile|MetadataRemoteFile */
  ) /*: RemoteNoteBuilder */ {
    return new RemoteNoteBuilder(this.cozy, old)
  }

  remoteErased(
    old /*: ?RemoteFile|MetadataRemoteFile|RemoteDir|MetadataRemoteDir */
  ) /*: RemoteErasedBuilder */ {
    return new RemoteErasedBuilder(this.cozy, old)
  }

  buildRemoteTree(
    paths /*: Array<string|[string, number]> */
  ) /*: RemoteTree */ {
    const remoteDocsByPath = {}
    for (const p of paths) {
      let docPath, shortRev
      if (typeof p === 'string') {
        docPath = p
        shortRev = 1
      } else {
        docPath = p[0]
        shortRev = p[1]
      }
      const name = path.posix.basename(docPath)
      const parentPath = path.posix.dirname(docPath)
      const parentDir = remoteDocsByPath[parentPath + '/'] || {
        _id: ROOT_DIR_ID,
        path: '/'
      }

      if (docPath.endsWith('/')) {
        remoteDocsByPath[docPath] = this.remoteDir()
          .name(name)
          .inDir(parentDir)
          .shortRev(shortRev)
          .build()
      } else if (docPath.endsWith('cozy-note')) {
        remoteDocsByPath[docPath] = this.remoteNote()
          .name(name)
          .inDir(parentDir)
          .shortRev(shortRev)
          .build()
      } else {
        remoteDocsByPath[docPath] = this.remoteFile()
          .name(name)
          .inDir(parentDir)
          .shortRev(shortRev)
          .build()
      }
    }

    return remoteDocsByPath
  }

  async createRemoteTree(paths /*: string[] */) /*: Promise<RemoteTree> */ {
    const remoteDocsByPath = {}
    for (const docPath of paths) {
      const name = path.posix.basename(docPath)
      const parentPath = path.posix.dirname(docPath)
      const parentDir = remoteDocsByPath[parentPath + '/'] || {
        _id: ROOT_DIR_ID,
        path: '/'
      }

      if (docPath.endsWith('/')) {
        remoteDocsByPath[docPath] = await this.remoteDir()
          .name(name)
          .inDir(parentDir)
          .create()
      } else if (docPath.endsWith('cozy-note')) {
        remoteDocsByPath[docPath] = await this.remoteNote()
          .name(name)
          .inDir(parentDir)
          .create()
      } else {
        remoteDocsByPath[docPath] = await this.remoteFile()
          .name(name)
          .inDir(parentDir)
          .create()
      }
    }

    return remoteDocsByPath
  }

  remoteWarnings() /*: Warning[] */ {
    return [
      {
        status: 402,
        title: 'TOS Updated',
        code: 'tos-updated',
        detail: 'Terms of services have been updated',
        links: {
          self: 'https://manager.cozycloud.cc/cozy/tos?domain=...'
        }
      }
    ]
  }

  stream() /*: StreamBuilder */ {
    return new StreamBuilder()
  }

  event(old /*: ?AtomEvent */) /*: AtomEventBuilder */ {
    return new AtomEventBuilder(old)
  }

  nonEmptyBatch(batchNumber /*: number */ = 1) /*: AtomEvent[] */ {
    return [
      this.event()
        .action('created')
        .kind('file')
        .path(`file-from-batch-${batchNumber}`)
        .build(),
      this.event()
        .action('deleted')
        .kind('directory')
        .path(`dir-from-batch-${batchNumber}`)
        .build()
    ]
  }

  stats() /*: StatsBuilder */ {
    return process.platform === 'win32'
      ? new WinStatsBuilder()
      : new DefaultStatsBuilder()
  }
}
