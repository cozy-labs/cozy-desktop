/** Wraps a CozyClient instance with a domain specific API.
 *
 * See the `ClientWrapper` interface.
 *
 * @module core/remote/clientWrapper
 * @flow
 */

/*::
import type { CozyClient } from 'cozy-client'
import type { Readable } from 'stream'

import type { CouchDBDeletion, CouchDBDoc, FullRemoteFile, RemoteDir } from './document'

export type ChangesFeedResponse = Promise<{
  last_seq: string,
  docs: $ReadOnlyArray<CouchDBDoc|CouchDBDeletion>,
  isInitialFetch: boolean
}>

export interface ClientWrapper {
  client?: CozyClient,

  changes(seq?: string, batchSize?: number): ChangesFeedResponse,
  getDirectoryContent(RemoteDir, opts?: { batchSize?: number }):  Promise<$ReadOnlyArray<FullRemoteFile|RemoteDir>>,
  isSharedDriveShortcut(CouchDBDoc|CouchDBDeletion|FullRemoteFile|RemoteDir): Promise<boolean>,
  downloadBinary(string): Promise<Readable>,
  findMaybeByPath(string): Promise<?FullRemoteFile|RemoteDir>,
}
*/
