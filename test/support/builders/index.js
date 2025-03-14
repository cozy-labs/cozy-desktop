/** Test data builders. Plain functions or Object mother patterns.
 *
 * @module test/support/builders
 * @flow
 */

const path = require('path')

const ChannelEventBuilder = require('./channel_event')
const ChecksumBuilder = require('./checksum')
const DirMetadataBuilder = require('./metadata/dir')
const FileMetadataBuilder = require('./metadata/file')
const RemoteDirBuilder = require('./remote/dir')
const RemoteErasedBuilder = require('./remote/erased')
const RemoteFileBuilder = require('./remote/file')
const RemoteNoteBuilder = require('./remote/note')
const { DefaultStatsBuilder, WinStatsBuilder } = require('./stats')
const StreamBuilder = require('./stream')
const { ROOT_DIR_ID } = require('../../../core/remote/constants')

/*::
import type { Readable } from 'stream'
import type { CozyClient } from 'cozy-client'
import type { Metadata, MetadataRemoteFile, MetadataRemoteDir } from '../../../core/metadata'
import type { Pouch } from '../../../core/pouch'
import type { Warning } from '../../../core/remote/cozy'
import type { FullRemoteFile, RemoteDir } from '../../../core/remote/document'
import type { ChannelEvent } from '../../../core/local/channel_watcher/event'
import type { StatsBuilder } from './stats'
import type { RemoteTree } from '../helpers/remote'
*/

// Test data builders facade.
//
//     builders.metafile()...
//     builders.remoteDir()...
//     builders.stream()...
//
module.exports = class Builders {
  /*::
  client: ?CozyClient
  pouch: ?Pouch
  */

  constructor({
    client,
    pouch
  } /*: { +client?: CozyClient, +pouch?: Pouch } */ = {}) {
    this.client = client
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

  remoteDir(old /*: ?RemoteDir */) /*: RemoteDirBuilder */ {
    return new RemoteDirBuilder(this.client, old)
  }

  remoteFile(old /*: ?FullRemoteFile */) /*: RemoteFileBuilder */ {
    return new RemoteFileBuilder(this.client, old)
  }

  remoteNote(old /*: ?FullRemoteFile */) /*: RemoteNoteBuilder */ {
    return new RemoteNoteBuilder(this.client, old)
  }

  remoteErased(
    old /*: ?FullRemoteFile|RemoteDir */
  ) /*: RemoteErasedBuilder */ {
    return new RemoteErasedBuilder(this.client, old)
  }

  buildRemoteTree(
    paths /*: Array<string|[string, number]> */
  ) /*: RemoteTree */ {
    const dirs = {}
    const files = {}
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
      const parentDir = dirs[parentPath + '/'] || {
        _id: ROOT_DIR_ID,
        path: '/'
      }

      if (docPath.endsWith('/')) {
        dirs[docPath] = this.remoteDir()
          .name(name)
          .inDir(parentDir)
          .shortRev(shortRev)
          .build()
      } else if (docPath.endsWith('cozy-note')) {
        files[docPath] = this.remoteNote()
          .name(name)
          .inDir(parentDir)
          .shortRev(shortRev)
          .build()
      } else {
        files[docPath] = this.remoteFile()
          .name(name)
          .inDir(parentDir)
          .shortRev(shortRev)
          .build()
      }
    }

    return { dirs, files }
  }

  async createRemoteTree(paths /*: string[] */) /*: Promise<RemoteTree> */ {
    const dirs = {}
    const files = {}
    for (const docPath of paths) {
      const name = path.posix.basename(docPath)
      const parentPath = path.posix.dirname(docPath)
      const parentDir = dirs[parentPath + '/'] || {
        _id: ROOT_DIR_ID,
        path: '/'
      }

      if (docPath.endsWith('/')) {
        dirs[docPath] = await this.remoteDir()
          .name(name)
          .inDir(parentDir)
          .create()
      } else if (docPath.endsWith('cozy-note')) {
        files[docPath] = await this.remoteNote()
          .name(name)
          .inDir(parentDir)
          .create()
      } else {
        files[docPath] = await this.remoteFile()
          .name(name)
          .inDir(parentDir)
          .create()
      }
    }

    return { dirs, files }
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

  checksum(data /*: string | Readable */) /*: ChecksumBuilder */ {
    return new ChecksumBuilder(data)
  }

  event(old /*: ?ChannelEvent */) /*: ChannelEventBuilder */ {
    return new ChannelEventBuilder(old)
  }

  nonEmptyBatch(batchNumber /*: number */ = 1) /*: ChannelEvent[] */ {
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
