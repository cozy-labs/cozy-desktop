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
  DIR_TYPE as DIR,
  VERSIONS_DOCTYPE,
} from './constants'

// ('contents') => Array<JsonApiRef>
// ('file') => ?JsonApiRef
// ('old_versions') => Array<JsonApiFileVersion>
// ('referenced_by') => Array<JsonApiRef>
export type RemoteRelations = any => any

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
export type FullRemoteFile = {| ...RemoteFile, path: string |}
export type RemoteDir = {| ...RemoteBase, ...RemoteDirAttributes |}
export type RemoteDoc = RemoteFile|RemoteDir

export type RemoteFileVersion = {|
  _id: string,
  _rev: string,
  _type: VERSIONS_DOCTYPE,
  cozyMetadata: Object,
  md5sum: string,
  metadata?: Object,
  relationships: JsonApiRelationShips,
  size: string,
  tags: string[],
  updated_at: string,
|}

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
export type CouchDBDir = {|
  ...CommonCouchDBAttributes,
  type: DIR,
  not_synchronized_on?: Array<{
    id: string,
    type: string
  }>,
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
export type CouchDBDoc = CouchDBDir | CouchDBFile
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
export type RemoteJsonFile = {|
  _id: string,
  _rev: string,
  _type: string,
  attributes: JsonApiFileAttributes,
  relations?: RemoteRelations,
  relationships: JsonApiRelationShips,
|}
export type RemoteJsonDir = {|
  _id: string,
  _rev: string,
  _type: string,
  attributes: JsonApiDirAttributes,
  relations?: RemoteRelations,
  relationships: JsonApiRelationShips,
|}
export type RemoteJsonDoc = RemoteJsonFile|RemoteJsonDir

// New cozy-client responses types
type JsonApiRef = {
  id: string,
  type: string,
}

type JsonApiFileVersionAttributes = {|
  md5sum: string,
  size: string,
  tags: string[],
  updated_at: string,
|}

export type JsonApiFileVersion = {|
  _id: string,
  _rev: string,
  _type: VERSIONS_DOCTYPE,
  attributes: JsonApiFileVersionAttributes,
  cozyMetadata: Object,
  metadata?: Object,
  relationships: JsonApiRelationShips,
|}

type JsonApiRelationShips = {|
  contents?: { data?: JsonApiRef[] },
  file?: { data: JsonApiRef },
  old_versions?: { data?: JsonApiFileVersion[] },
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
  jsonApiToRemoteJsonDoc,
  jsonFileVersionToRemoteFileVersion
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
function withDefaultValues /*:: <T: JsonApiDirAttributes|JsonApiFileAttributes|JsonApiFileVersionAttributes> */(
  attributes /*: T */
) /*: T */ {
  if (attributes.type) {
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
  } else {
    return {
      ...attributes,
      md5sum: attributes.md5sum || '',
      size: attributes.size || '0',
      tags: attributes.tags || []
    }
  }
}

// It appears the `relations` attribute is not always added to remote documents
// by `cozy-client-js` so we use a function always returning an empty array in
// this case.
// Also, when a remote file has never been modified, its `old_versions` relation
// will return `undefined` instead of an empty Array so we'll default the
// returned value to an empty Array instead.
function withDefaultRelations /*::<T: ?RemoteRelations> */(
  relations /*: T */
) /*: { relations: RemoteRelations } */ {
  if (relations != null) {
    const originalRelations = relations
    return {
      relations: relation => originalRelations(relation) || []
    }
  } else {
    return {
      relations: () => []
    }
  }
}

function remoteJsonToRemoteDoc /*:: <T: RemoteJsonDoc> */(
  json /*: T */
) /*: RemoteDoc */ {
  if (json.attributes.type === DIR_TYPE) {
    const remoteDir = ({
      type: DIR_TYPE,
      _id: json._id,
      _rev: json._rev,
      ...withDefaultValues(json.attributes),
      ...withDefaultRelations(json.relations)
    } /*: RemoteDir */)

    return remoteDir
  } else {
    const remoteFile = ({
      type: FILE_TYPE,
      _id: json._id,
      _rev: json._rev,
      ...withDefaultValues(json.attributes),
      ...withDefaultRelations(json.relations)
    } /*: RemoteFile */)

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
  } else if (!json.meta || !json.meta.rev) {
    throw new Error('Missing meta.rev attribute in JsonAPI resource.')
  } else {
    const { attributes, id, type, relationships } = json

    return attributes.type === DIR_TYPE
      ? ({
          _id: id,
          _type: type,
          _rev: json.meta.rev,
          attributes,
          relationships
        } /*: RemoteJsonDir */)
      : ({
          _id: id,
          _type: type,
          _rev: json.meta.rev,
          attributes,
          relationships
        } /*: RemoteJsonFile */)
  }
}

function jsonFileVersionToRemoteFileVersion(
  version /*: JsonApiFileVersion */
) /*: RemoteFileVersion */ {
  return {
    _id: version._id,
    _rev: version._rev,
    _type: version._type,
    cozyMetadata: version.cozyMetadata,
    metadata: version.metadata,
    relationships: version.relationships,
    ...withDefaultValues(version.attributes)
  }
}
