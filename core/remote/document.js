/** The remote Cozy metadata, as returned by cozy-client-js.
 *
 * @module core/remote/document
 * @flow
 */

const { uniq } = require('lodash')

const {
  FILE_TYPE,
  DIR_TYPE,
  ROOT_DIR_ID,
  TRASH_DIR_ID,
  TRASH_DIR_NAME
} = require('./constants')

/*::
import type {
  FILE_TYPE as FILE,
  DIR_TYPE as DIR
} from './constants'

export type RemoteFileAttributes = {|
  type: FILE,
  class: string,
  executable?: boolean,
  md5sum: string,
  mime: string,
  size: string,
|}
export type RemoteDirAttributes = {|
  type: DIR,
  path: string,
|}
export type RemoteBase = {|
  _id: string,
  _rev: string,
  _type: string,
  _deleted?: true,
  dir_id: string,
  name: string,
  tags: string[],
  trashed?: true,
  created_at: string,
  updated_at: string,
  cozyMetadata?: Object,
  metadata?: Object,
  restore_path?: string,
|}
export type RemoteFile = {| ...RemoteBase, ...RemoteFileAttributes |}
export type RemoteDir = {| ...RemoteBase, ...RemoteDirAttributes |}
export type RemoteDoc = RemoteFile|RemoteDir

export type RemoteDeletion = {
  _id: string,
  _rev: string,
  _deleted: true
}

export type JsonApiFileAttributes = {
  type: FILE,
  class?: string,
  dir_id: string,
  executable?: boolean,
  md5sum?: string,
  mime?: string,
  name: string,
  size?: string,
  tags: string[],
  trashed?: true,
  created_at: string,
  updated_at: string,
  cozyMetadata?: Object,
  metadata?: Object,
  restore_path?: string,
}
export type JsonApiDirAttributes = {
  type: DIR,
  dir_id: string,
  name: string,
  path?: string,
  tags: string[],
  trashed?: true,
  created_at: string,
  updated_at: string,
  cozyMetadata?: Object,
  metadata?: Object,
  restore_path?: string,
}
export type JsonApiBase = {|
  _id: string,
  _rev: string,
  _type: string,
  _deleted?: true,
|}
export type JsonApiFile = {| ...JsonApiBase, attributes: JsonApiFileAttributes |}
export type JsonApiDir = {| ...JsonApiBase, attributes: JsonApiDirAttributes |}
export type JsonApiDoc = JsonApiFile|JsonApiDir
*/

module.exports = {
  specialId,
  dropSpecialDocs,
  keepFiles,
  parentDirIds,
  inRemoteTrash,
  jsonApiToRemoteDoc
}

function specialId(id /*: string */) {
  return id === ROOT_DIR_ID || id === TRASH_DIR_ID || id.startsWith('_design/')
}

function dropSpecialDocs(docs /*: RemoteDoc[] */) /*: RemoteDoc[] */ {
  return docs.filter(doc => !specialId(doc._id))
}

function keepFiles(docs /*: RemoteDoc[] */) /*: RemoteDoc[] */ {
  return docs.filter(doc => doc.type === FILE_TYPE)
}

function parentDirIds(docs /*: RemoteDoc[] */) {
  return uniq(docs.map(doc => doc.dir_id))
}

function inRemoteTrash(
  doc /*: { trashed?: true, type: FILE, path: string } | { trashed?: true, type: DIR, path: string } */
) /*: boolean */ {
  return (
    !!doc.trashed ||
    (doc.type === DIR_TYPE && doc.path.startsWith(`/${TRASH_DIR_NAME}/`))
  )
}

function jsonApiToRemoteDoc(json /*: JsonApiDoc */) /*: RemoteDoc */ {
  if (json.attributes.type === DIR_TYPE) {
    const remoteDir = ({
      type: DIR_TYPE,
      _id: json._id,
      _rev: json._rev,
      _type: json._type,
      ...(json.attributes /*: JsonApiDirAttributes */)
    } /*: RemoteDir */)

    if (json._deleted) remoteDir._deleted = true

    return remoteDir
  } else {
    const remoteFile = ({
      type: FILE_TYPE,
      _id: json._id,
      _rev: json._rev,
      _type: json._type,
      _deleted: json._deleted,
      ...(json.attributes /*: JsonApiFileAttributes */)
    } /*: RemoteFile */)

    if (json._deleted) remoteFile._deleted = true

    return remoteFile
  }
}
