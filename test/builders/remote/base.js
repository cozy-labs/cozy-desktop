/* @flow weak */
import { DIR_TYPE, FILE_TYPE, ROOT_DIR_ID } from '../../../src/remote/constants'

import type { RemoteDoc } from '../../../src/remote/document'

export type FilesResponseData = {
  _id: string,
  _type: string,
  _rev: string,
  attributes: {
    type: string,
    name: string,
    dir_id: string,
    created_at: string,
    updated_at: string,
    size?: string,
    md5sum?: string,
    mime?: string,
    class?: string,
    executable?: boolean,
    tags: string[],
    path?: string
  }
}

export default class RemoteBaseBuilder {
  cozy: *
  options: Object

  constructor (cozy) {
    this.cozy = cozy
    this.options = {
      dirID: ROOT_DIR_ID
    }
  }

  inDir (dir) {
    this.options.dirID = dir._id
    return this
  }

  inRootDir () {
    this.options.dirID = ROOT_DIR_ID
    return this
  }

  named (name) {
    this.options.name = name
    return this
  }

  toRemoteMetadata (responseData: FilesResponseData): RemoteDoc {
    let metadata = {}

    Object.assign(metadata, {
      _id: responseData._id,
      _rev: responseData._rev,
      _type: responseData._type,
      created_at: responseData.attributes.created_at,
      dir_id: responseData.attributes.dir_id,
      name: responseData.attributes.name,
      tags: responseData.attributes.tags,
      type: responseData.attributes.type,
      updated_at: responseData.attributes.updated_at
    })

    switch (metadata.type) {
      case DIR_TYPE:
        Object.assign(metadata, {
          path: responseData.attributes.path
        })
        break

      case FILE_TYPE:
        Object.assign(metadata, {
          class: responseData.attributes.class,
          executable: responseData.attributes.executable,
          md5sum: responseData.attributes.md5sum,
          mime: responseData.attributes.mime,
          size: responseData.attributes.size
        })
        break
    }

    return metadata
  }
}
