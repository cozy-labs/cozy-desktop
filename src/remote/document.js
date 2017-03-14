/* @flow */

import { DIR_TYPE, FILE_TYPE, ROOT_DIR_ID, TRASH_DIR_ID } from './constants'

export function specialId (id: string) {
  return (
    id === ROOT_DIR_ID ||
    id === TRASH_DIR_ID ||
    id.startsWith('_design/')
  )
}

// TODO: Define separate types for files and folders

// The remote Cozy metadata, as returned by cozy-client-js
export type RemoteDoc = {
  _id: string,
  _rev: string,
  _type: string,
  class?: string,
  created_at: string,
  dir_id: string,
  executable?: boolean,
  md5sum?: string,
  mime?: string,
  name: string,
  path: string, // folder and file
  size?: string,
  tags: string[],
  type: string,
  updated_at: string
}

export type JsonApiDoc = {
  _id: string,
  _rev: string,
  _type: string,
  attributes: JsonApiAttributes,
}

export type JsonApiAttributes = {
  class?: string, // file only
  created_at: string,
  dir_id: string,
  executable?: boolean, // file only
  md5sum?: string, // file only
  mime?: string, // file only
  name: string,
  path?: string, // folder only
  size?: string, // file only
  tags: string[],
  type: string,
  updated_at: string
}

export function jsonApiToRemoteDoc (json: JsonApiDoc): RemoteDoc {
  let metadata = {}

  Object.assign(metadata, {
    _id: json._id,
    _rev: json._rev,
    _type: json._type,
    created_at: json.attributes.created_at,
    dir_id: json.attributes.dir_id,
    name: json.attributes.name,
    tags: json.attributes.tags,
    type: json.attributes.type,
    updated_at: json.attributes.updated_at
  })

  switch (metadata.type) {
    case DIR_TYPE:
      Object.assign(metadata, {
        path: json.attributes.path
      })
      break

    case FILE_TYPE:
      Object.assign(metadata, {
        class: json.attributes.class,
        executable: json.attributes.executable,
        md5sum: json.attributes.md5sum,
        mime: json.attributes.mime,
        size: json.attributes.size
      })
      break
  }

  return metadata
}
