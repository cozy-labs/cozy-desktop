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
  not_synchronized_on?: Array<{
    id: string,
    type: string
  }>
|}

export type RemoteBase = {|
  _id: string,
  _rev: string,
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

export type RemoteDeletion = {|
  _id: string,
  _rev: string,
  _deleted: true
|}

export type JsonApiFileAttributes = {|
  type: FILE,
  class?: string, // file only
  dir_id: string,
  executable?: boolean,
  md5sum?: string,
  mime?: string,
  name: string,
  size?: string, // file only
  tags: string[],
  trashed?: true,
  created_at: string,
  updated_at: string,
  cozyMetadata?: Object,
  metadata?: Object,
  restore_path?: string,
|}

export type JsonApiDirAttributes = {|
  type: DIR,
  dir_id: string,
  name: string,
  path?: string, // folder only
  tags: string[],
  trashed?: true,
  created_at: string,
  updated_at: string,
  cozyMetadata?: Object,
  metadata?: Object,
  restore_path?: string,
|}

// Old cozy-client-js responses type
export type RemoteJsonFile = {|
  _id: string,
  _rev: string,
  _type: string,
  attributes: JsonApiFileAttributes,
|}
export type RemoteJsonDir = {|
  _id: string,
  _rev: string,
  _type: string,
  attributes: JsonApiDirAttributes,
|}
export type RemoteJsonDoc = RemoteJsonFile|RemoteJsonDir

// New cozy-client responses types
type JsonApiRef = {
  id: string,
  type: string,
}

type JsonApiDeletion = {|
  id: string,
  rev: string,
  _deleted: true
|}

type JsonApiDoc =
  {|
    id: string,
    type: string,
    meta?: {
      rev?: string
    },
    links: Object,
    attributes: JsonApiFileAttributes|JsonApiDirAttributes,
    relationships: { [string]: { data?: JsonApiRef | JsonApiRef[] } }
  |}
  | JsonApiDeletion
*/

module.exports = {
  specialId,
  dropSpecialDocs,
  keepFiles,
  parentDirIds,
  inRemoteTrash,
  remoteJsonToRemoteDoc,
  jsonApiToRemoteJsonDoc
}

function specialId(id /*: string */) {
  return id === ROOT_DIR_ID || id === TRASH_DIR_ID || id.startsWith('_design/')
}

function dropSpecialDocs(
  docs /*: Array<RemoteDoc|RemoteDeletion> */
) /*: Array<RemoteDoc|RemoteDeletion> */ {
  return docs.filter(doc => !specialId(doc._id))
}

function isFile(doc /*: RemoteDoc|RemoteDeletion */) /*: boolean %checks */ {
  return doc._deleted ? false : doc.type === FILE_TYPE
}

function keepFiles(
  docs /*: Array<RemoteDoc|RemoteDeletion> */
) /*: RemoteDoc[] */ {
  // $FlowFixMe filter() removes the RemoteDeletion items
  return docs.filter(isFile)
}

function parentDirIds(docs /*: RemoteDoc[] */) {
  return uniq(docs.map(doc => doc && doc.dir_id))
}

function inRemoteTrash(
  doc /*: { trashed?: true, type: FILE, path: string } | { trashed?: true, type: DIR, path: string } */
) /*: boolean %checks */ {
  return (
    !!doc.trashed ||
    (doc.path != null && doc.path.startsWith(`/${TRASH_DIR_NAME}/`))
  )
}

function remoteJsonToRemoteDoc /*:: <T: RemoteJsonDoc> */(
  json /*: T */
) /*: RemoteDoc */ {
  if (json.attributes.type === DIR_TYPE) {
    const remoteDir = ({
      type: DIR_TYPE,
      _id: json._id,
      _rev: json._rev,
      ...json.attributes
    } /*: RemoteDir */)

    return remoteDir
  } else {
    const remoteFile = ({
      type: FILE_TYPE,
      _id: json._id,
      _rev: json._rev,
      ...json.attributes
    } /*: RemoteFile */)

    return remoteFile
  }
}

function jsonApiToRemoteJsonDoc(
  json /*: JsonApiDoc */
) /*: RemoteJsonDoc|RemoteDeletion */ {
  if (json._deleted) {
    return ({
      _id: json.id,
      _rev: json.rev,
      _deleted: true
    } /*: RemoteDeletion */)
  }

  if (!json.meta || !json.meta.rev) {
    throw new Error('Missing meta.rev attribute in JsonAPI resource.')
  }

  return json.attributes.type === DIR_TYPE
    ? ({
        _id: json.id,
        _type: json.type,
        _rev: json.meta && json.meta.rev,
        attributes: json.attributes
      } /*: RemoteJsonDir */)
    : ({
        _id: json.id,
        _type: json.type,
        _rev: json.meta && json.meta.rev,
        attributes: json.attributes
      } /*: RemoteJsonFile */)
}
