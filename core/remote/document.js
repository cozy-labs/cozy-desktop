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

/* Possible representations of the same io.cozy.file :
 *
 * - CouchDB representation :
 *    basic data, always returned
 *
 * - Changes feed representation :
 *    CouchDB doc
 *    + extra attributes like `path` for files
 *
 * - cozy-client-js representation :
 *    somewhat JsonApi but not quite with CouchDB doc in `attributes` attribute
 *    + `relations` function attribute
 *
 * - cozy-client representation :
 *    Full JsonApi representation with CouchDB doc in `attributes`
 *
 * - reconciled remote doc representation ? :
 *    RemoteDoc and/or MetadataRemoteInfo
 */

/*::
import type {
  FILE_TYPE as FILE,
  DIR_TYPE as DIR
} from './constants'

//
// --- CouchDB representations
//
// Basic data always returned by requests to the Cozy.
//

type CommonCouchDBAttributes = {|
  _id: string,
  _rev: string,
  cozyMetadata: Object,
  created_at: string,
  dir_id: string,
  metadata?: Object,
  name: string,
  restore_path?: string,
  updated_at: string,
  tags: string[],
|}

type CouchDBFileAttributes = {|
  type: FILE,
  class: string,
  executable?: boolean,
  md5sum: string,
  mime: string,
  size: string,
  trashed: boolean,
|}
export type CouchDBFile = {|
  ...CommonCouchDBAttributes,
  ...CouchDBFileAttributes
|}

type CouchDBDirAttributes = {|
  type: DIR,
  path: string,
  not_synchronized_on?: Array<{
    id: string,
    type: string
  }>,
|}
export type CouchDBDir = {|
  ...CommonCouchDBAttributes,
  ...CouchDBDirAttributes
|}

export type CouchDBDoc = CouchDBFile | CouchDBDir

export type CouchDBDeletion = {|
  _id: string,
  _rev: string,
  _deleted: true
|}


//
// --- Changes feed representations
//
// CouchDB document representation with some transformations done by
// `cozy-stack` like adding a `path` attribute to files.
//

export type ChangesFeedFile = {|
  ...CouchDBFile,
  path: string
|}

export type ChangesFeedDir = CouchDBDir

export type ChangesFeedChange = {|
  id: string,
  seq: string,
  doc: ChangesFeedFile|ChangesFeedDir|CouchDBDeletion,
  changes: $ReadOnlyArray<{| rev: string |}>
|}


//
// --- cozy-client-js representations (somewhat JsonApi)
//
// JsonApi like representation created by `cozy-client-js`. It wraps the CouchDB
// document representation in the `attributes` attribute and adds a `relations`
// function attribute which returns hydrated relationships of the given type.
//

// ('contents') => Array<JsonApiRef>
// ('referenced_by') => Array<JsonApiRef>
export type RemoteRelations = any => Array<any>

export type OldJsonFile = {|
  _id: string,
  _rev: string,
  _type: string,
  attributes: CouchDBFile,
  relations: RemoteRelations
|}

export type OldJsonDir = {|
  _id: string,
  _rev: string,
  _type: string,
  attributes: CouchDBDir,
  relations: RemoteRelations
|}

export type OldJsonDoc = OldJsonFile | OldJsonDir


//
// --- cozy-client representations (full JsonApi)
//
// Full JsonApi representation returned by `cozy-client` on most requests with
// the CouchDB document representation in the `attributes` attribute and extra
// attributes like `links`, `meta` and `relationships`.
//

type JsonApiRef = {|
  id: string,
  type: string,
|}

type JsonApiRelationShips = {|
  contents?: { data?: JsonApiRef[] },
  referenced_by?: { data?: JsonApiRef | JsonApiRef[] },
|}

type CommonJsonApiAttributes = {|
  id: string,
  type: string,
  meta?: {
    rev?: string
  },
  links: Object,
|}

type JsonApiFile = {|
  ...CommonJsonApiAttributes,
  attributes: CouchDBFile,
  relationships: {|
    referenced_by?: { data?: JsonApiRef | JsonApiRef[] },
  |}
|}

type JsonApiDir = {|
  ...CommonJsonApiAttributes,
  attributes: CouchDBDir,
  relationships: {|
    contents?: { data?: JsonApiRef[] },
    referenced_by?: { data?: JsonApiRef | JsonApiRef[] },
  |}
|}

type JsonApiDoc = JsonApiFile | JsonApiDir

type JsonApiDeletion = {|
  id: string,
  rev: string,
  _deleted: true
|}


//
// --- Reconciled remote representation (FIXME: is it necessary?)
//

type CommonRemoteAttributes = {|
  _id: string,
  _rev: string,
  cozyMetadata?: Object,
  created_at: string,
  dir_id: string,
  metadata?: Object,
  name: string,
  path: string,
  relations: RemoteRelations,
  restore_path?: string,
  tags: string[],
  updated_at: string,
|}

export type RemoteFile = {|
  ...CommonRemoteAttributes,
  ...CouchDBFile
|}

export type RemoteDir = {|
  ...CommonRemoteAttributes,
  ...CouchDBDir
|}

*/

module.exports = {
  specialId,
  dropSpecialDocs,
  inRemoteTrash,
  trashedDoc,
  withDefaultValues,
  oldJsonToRemoteDir,
  oldJsonToRemoteFile,
  withPath,
  jsonApiDeletionToCouchDBDeletion,
  jsonApiDirToOldJsonDir,
  jsonApiFileToOldJsonFile
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
function withDefaultValues /*:: <T: CouchDBFile|CouchDBDir> */(
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

function oldJsonToRemoteDir(json /*: OldJsonDir */) /*: RemoteDir */ {
  return {
    type: DIR_TYPE,
    _id: json._id,
    _rev: json._rev,
    ...withDefaultValues(json.attributes),
    relations: json.relations
  }
}

function oldJsonToRemoteFile(
  json /*: OldJsonFile */,
  parentDir /*: RemoteDir */
) /*: RemoteFile */ {
  return withPath(
    {
      type: FILE_TYPE,
      _id: json._id,
      _rev: json._rev,
      ...withDefaultValues(json.attributes),
      relations: json.relations
    },
    parentDir
  )
}

/** Set the path of a remote file doc. */
function withPath(
  doc /*: $Diff<RemoteFile, { path: string }> */,
  parentDir /*: RemoteDir */
) /*: RemoteFile */ {
  return {
    ...doc,
    path: posixPath.join(parentDir.path, doc.name)
  }
}

function jsonApiDeletionToCouchDBDeletion(
  json /*: JsonApiDeletion */
) /*: CouchDBDeletion */ {
  return {
    _id: json.id,
    _rev: json.rev,
    _deleted: true
  }
}

function jsonApiDirToOldJsonDir(json /*: JsonApiDir */) /*: OldJsonDir */ {
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

function jsonApiFileToOldJsonFile(json /*: JsonApiFile */) /*: OldJsonFile */ {
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
      const { referenced_by } = relationships
      return relation === 'referenced_by' && referenced_by && referenced_by.data
        ? Array(referenced_by.data)
        : []
    }
  }
}
