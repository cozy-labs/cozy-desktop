/** The remote Cozy metadata, as returned by cozy-client-js.
 *
 * @module core/remote/document
 * @flow
 */

const posixPath = require('path').posix

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

// ('contents') => Array<JsonApiRef>
// ('referenced_by') => Array<JsonApiRef>
type RemoteRelations = any => Array<any>

export type RemoteFileAttributes = {|
  type: FILE,
  class: string,
  executable?: boolean,
  md5sum: string,
  mime: string,
  size: string,
  trashed: boolean,
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
  created_at: string,
  updated_at: string,
  cozyMetadata?: Object,
  metadata?: Object,
  restore_path?: string,
  relations: RemoteRelations
|}
export type RemoteFile = {| ...RemoteBase, ...RemoteFileAttributes |}
export type RemoteDir = {| ...RemoteBase, ...RemoteDirAttributes |}
export type RemoteDoc = RemoteFile|RemoteDir

export type CouchDBChange = {|
  id: string,
  seq: string,
  doc: CouchDBDoc|CouchDBDeletion,
  changes: $ReadOnlyArray<{| rev: string |}>
|}
type CommonCouchDBAttributes = {|
  _id: string,
  _rev: string,
  cozyMetadata: Object,
  created_at: string,
  dir_id: string,
  metadata?: Object,
  name: string,
  path: string,
  restore_path?: string,
  updated_at: string,
  tags: string[],
|}
export type CouchDBFile = {|
  ...CommonCouchDBAttributes,
  type: FILE,
  class: string,
  executable?: boolean,
  md5sum: string,
  mime: string,
  size: string,
  trashed: boolean,
|}
export type CouchDBDir = {|
  ...CommonCouchDBAttributes,
  type: DIR,
  not_synchronized_on?: Array<{
    id: string,
    type: string
  }>,
|}
export type CouchDBDoc = CouchDBFile | CouchDBDir
export type CouchDBDeletion = {|
  _id: string,
  _rev: string,
  _deleted: true
|}

export type JsonApiFileAttributes = {|
  type: FILE,
  class?: string, // file only
  dir_id?: string,
  executable?: boolean,
  md5sum?: string,
  mime?: string,
  name?: string,
  size?: string, // file only
  tags?: string[],
  trashed: boolean,
  created_at: string,
  updated_at: string,
  cozyMetadata?: Object,
  metadata?: Object,
  restore_path?: string,
|}

export type JsonApiDirAttributes = {|
  type: DIR,
  dir_id?: string,
  name?: string,
  path?: string, // folder only
  tags?: string[],
  created_at: string,
  updated_at: string,
  cozyMetadata?: Object,
  metadata?: Object,
  restore_path?: string,
|}

// Old cozy-client-js responses type
export type RemoteJsonDoc = {|
  _id: string,
  _rev: string,
  _type: string,
  attributes: JsonApiFileAttributes|JsonApiDirAttributes,
  relations: RemoteRelations
|}

// New cozy-client responses types
type JsonApiRef = {
  id: string,
  type: string,
}

type JsonApiRelationShips = {|
  contents?: { data?: JsonApiRef[] },
  referenced_by?: { data?: JsonApiRef | JsonApiRef[] },
|}

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
    relationships: JsonApiRelationShips
  |}
  | JsonApiDeletion
*/

module.exports = {
  specialId,
  dropSpecialDocs,
  inRemoteTrash,
  trashedDoc,
  withDefaultValues,
  remoteJsonToRemoteDoc,
  jsonApiToRemoteJsonDoc
}

function isFile(
  doc /*: { type: DIR } | { type: FILE } */
) /*: boolean %checks */ {
  return doc.type === FILE_TYPE
}

function specialId(id /*: string */) /*: boolean %checks */ {
  return id === ROOT_DIR_ID || id === TRASH_DIR_ID || id.startsWith('_design/')
}

function dropSpecialDocs /*::<T: $ReadOnlyArray<{ _id: string }>>*/(
  docs /*: T */
) /*: T */ {
  return docs.filter(doc => !specialId(doc._id))
}

function inRemoteTrash(
  doc /*: { type: FILE, trashed: boolean } | { type: DIR, path: string } */
) /*: boolean %checks */ {
  return isFile(doc) ? doc.trashed : doc.path.startsWith(`/${TRASH_DIR_NAME}/`)
}

function trashedDoc /*::<T: { type: FILE, trashed: boolean } | { type: DIR, path: string } > */(
  doc /*: T */
) /*: T */ {
  return inRemoteTrash(doc)
    ? doc
    : isFile(doc)
    ? { ...doc, trashed: true }
    : { ...doc, path: posixPath.join('/', TRASH_DIR_NAME, doc.path) }
}

// The following attributes can be omitted by cozy-stack if not defined
function withDefaultValues /*:: <T: JsonApiDirAttributes|JsonApiFileAttributes> */(
  attributes /*: T */
) /*: T */ {
  if (attributes.type === DIR_TYPE) {
    return {
      ...attributes,
      dir_id: attributes.dir_id || '',
      name: attributes.name || '',
      path: attributes.path || '',
      tags: attributes.tags || []
    }
  } else {
    return {
      ...attributes,
      class: attributes.class || 'application',
      dir_id: attributes.dir_id || '',
      md5sum: attributes.md5sum || '',
      mime: attributes.mime || 'application/octet-stream',
      name: attributes.name || '',
      tags: attributes.tags || []
    }
  }
}

function remoteJsonToRemoteDoc(json /*: RemoteJsonDoc */) /*: RemoteDoc */ {
  if (json.attributes.type === DIR_TYPE) {
    const remoteDir = {
      type: DIR_TYPE,
      _id: json._id,
      _rev: json._rev,
      ...withDefaultValues(json.attributes),
      relations: json.relations
    }

    return remoteDir
  } else {
    const remoteFile = {
      type: FILE_TYPE,
      _id: json._id,
      _rev: json._rev,
      ...withDefaultValues(json.attributes),
      relations: json.relations
    }

    return remoteFile
  }
}

function jsonApiToRemoteJsonDoc(
  json /*: JsonApiDoc */
) /*: RemoteJsonDoc|CouchDBDeletion */ {
  if (json._deleted) {
    return ({
      _id: json.id,
      _rev: json.rev,
      _deleted: true
    } /*: CouchDBDeletion */)
  }

  if (!json.meta || !json.meta.rev) {
    throw new Error('Missing meta.rev attribute in JsonAPI resource.')
  }

  const { id, type, meta, attributes, relationships } = json
  return {
    _id: id,
    _type: type,
    _rev: (meta && meta.rev) || '',
    attributes,
    relations: relation => {
      const { contents, referenced_by } = relationships
      return relation === 'contents' && contents && contents.data
        ? contents.data
        : relation === 'referenced_by' && referenced_by && referenced_by.data
        ? Array(referenced_by.data)
        : []
    }
  }
}
