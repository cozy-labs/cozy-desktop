/** The remote Cozy metadata, as returned by cozy-client-js.
 *
 * @module core/remote/document
 * @flow
 */

const { uniq } = require('lodash')

const {
  FILE_TYPE,
  ROOT_DIR_ID,
  TRASH_DIR_ID,
  TRASH_DIR_NAME
} = require('./constants')

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

// TODO: Define separate types for files and folders

/*::
export type RemoteDoc = {
  _id: string,
  _rev: string,
  _type: string,
  class?: string,
  dir_id: string,
  executable?: boolean,
  md5sum?: string,
  mime?: string,
  name: string,
  path: string, // folder and file
  size?: string,
  tags: string[],
  trashed?: true,
  restore_path?: string,
  type: string,
  created_at: string,
  updated_at: string,
  cozyMetadata?: Object,
  metadata?: Object
}

export type RemoteDeletion = {
  _id: string,
  _rev: string,
  _deleted: true
}
*/

function dropSpecialDocs(docs /*: RemoteDoc[] */) /*: RemoteDoc[] */ {
  return docs.filter(doc => !specialId(doc._id))
}

function keepFiles(docs /*: RemoteDoc[] */) /*: RemoteDoc[] */ {
  return docs.filter(doc => doc.type === FILE_TYPE)
}

function parentDirIds(docs /*: RemoteDoc[] */) {
  return uniq(docs.map(doc => doc.dir_id))
}

function inRemoteTrash(doc /*: RemoteDoc */) /*: boolean */ {
  return doc.trashed || doc.path.startsWith(`/${TRASH_DIR_NAME}/`)
}

/*::
export type JsonApiAttributes = {
  class?: string, // file only
  dir_id: string,
  executable?: boolean, // file only
  md5sum?: string, // file only
  mime?: string, // file only
  name: string,
  path?: string, // folder only
  size?: string, // file only
  tags: string[],
  type: string,
  updated_at: string,
  cozyMetadata?: Object,
  metadata?: Object
}

export type JsonApiDoc = {
  _id: string,
  _rev: string,
  _type: string,
  attributes: JsonApiAttributes,
}
*/

function jsonApiToRemoteDoc(json /*: JsonApiDoc */) /*: * */ {
  let remoteDoc /*: RemoteDoc */ = {}

  Object.assign(
    remoteDoc,
    {
      _id: json._id,
      _rev: json._rev,
      _type: json._type
    },
    json.attributes
  )

  return remoteDoc
}
